import os
import shutil
import cv2
import torch
import json
import time
from torch.nn import functional as F
from src.train_log.IFNet_HDv3 import IFNet
from itertools import pairwise
from pathlib import Path
import random
from typing import Iterable
from pytorch_msssim import ms_ssim

device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")


config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()

model = None


def get_model():
    global model
    if model is None:
        def convert(param):
            return {k.replace("module.", ""): v for k, v in param.items() if "module." in k}
        model = IFNet()
        model.load_state_dict(convert(torch.load(CONFIG["filler"]["model"])))
        model.to(device)
    return model


class Filler:
    
    def __init__(self, run_dir) -> None:
        if not torch.cuda.is_available():
            print("Warning: CUDA not available, running on CPU.")
        self.flownet = get_model()

        self.frames_dir = f"{run_dir}/frames"
        self.replaced_dir = f"{run_dir}/replaced"

    def writeOnImage(self, path, txt):
        font = cv2.FONT_HERSHEY_SIMPLEX
        fontScale = 1
        fontColor = (255, 255, 255)
        thickness = 2
        lineType = cv2.LINE_AA
        img = cv2.imread(path)
        img = cv2.rectangle(img, (0, 0), (200, 75), (0, 0, 0), cv2.FILLED)
        cv2.putText(img, txt, (10, 50), font, fontScale, fontColor, thickness, lineType)
        cv2.imwrite(path, img)

    def get_padded_frame(self, frame_num):
        img_path = f"{self.replaced_dir}/{frame_num:04d}.png"
        if not os.path.exists(img_path):
            img_path = f"{self.frames_dir}/{frame_num:04d}.png"
        if not os.path.exists(img_path):
            return None, None, None
        print("Reading", img_path)
        img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
        # img = cv2.resize(img, (1280, 720))
        img = (torch.tensor(img.transpose(2, 0, 1)).to(device) / 255.0).unsqueeze(0)
        n, c, h, w = img.shape
        ph = ((h - 1) // 32 + 1) * 32
        pw = ((w - 1) // 32 + 1) * 32
        padding = (0, pw - w, 0, ph - h)
        img = F.pad(img, padding)
        return img, h, w

    def get_mid_frame(self, left, right):
        with torch.no_grad():
            flow, mask, merged = self.flownet(
                torch.cat((left, right), 1), 0.5, [8, 4, 2, 1]
            )
        return merged[3]
        # return self.flownet.inference(left, right)

    def transition_frames(self, left, right, count, depth=1) -> Iterable[tuple[int, torch.Tensor]]:
        kernal = (right-left)/(count+1)
        mid_frames = [(depth, left+kernal*(step+1)) for step in range(count)]
        return mid_frames
        
    def generate_frames(self, left, right, count, depth=1) -> Iterable[tuple[int, torch.Tensor]]:
        if count <= 0:
            return []
        if left is None:
            return [(depth, right)]*count
        if right is None:
            return [(depth, left)]*count
        if count % 2 == 1:
            mid = self.get_mid_frame(left, right)
            return [
                *self.generate_frames(left, mid, (count-1)//2, depth+1),
                (depth, mid),
                *self.generate_frames(mid, right, (count-1)//2, depth+1)
            ]
        if count >= 6:
            frames = self.generate_frames(left, right, count-1, depth)
            if random.randint(0, 1):
                return [*frames, frames[-1]]
            else:
                return [frames[0], *frames]
        
        if count == 2:
            temp = self.get_mid_frame(left, right)
            return [
                (depth+1, self.get_mid_frame(left, temp)),
                (depth+1, self.get_mid_frame(temp, right))
            ]
        
        if count == 4:
            temp = self.get_mid_frame(left, right)  # depth
            f1 = self.get_mid_frame(left, temp)     # depth+1
            f4 = self.get_mid_frame(temp, right)    # depth+1
            f2 = self.get_mid_frame(left, f4)       # depth+2
            f3 = self.get_mid_frame(f1, right)      # depth+2
            return [(depth+1, f1), (depth+2, f2), (depth+2, f3), (depth+1, f4)]

        raise Exception("Should not be reachable")

    def save_mid_frames(self, left_num, right_num):
        gen_count = right_num-left_num-1
        
        left, h, w = self.get_padded_frame(left_num)
        right, h, w = self.get_padded_frame(right_num)
        if left is None and right is None:
            return 0
        
        ssim = 0
        if left is not None and right is not None:
            ssim = float(ms_ssim(left, right, data_range=1, size_average=True))
        print(f"MS-SSIM between {left_num} and {right_num} = {ssim}")
            
        print(f"Generating {gen_count} frames between {left_num} and {right_num}")
        if ssim < 0.08:
            mid_frames = self.transition_frames(left, right, gen_count)
        else:
            mid_frames = self.generate_frames(left, right, gen_count)

        assert len(mid_frames) == gen_count
        
        for frame_num, (depth, frame) in zip(range(left_num+1, right_num), mid_frames):
            img = (frame[0] * 255).byte().cpu().numpy().transpose(1, 2, 0)[:h, :w]
            out_path = f"{self.replaced_dir}/{frame_num:04d}.png"
            cv2.imwrite(out_path, img)
            self.writeOnImage(out_path, f"N:{frame_num} D:{depth}")

    def generate_replacements(self, predict_frames):
        Path(self.replaced_dir).mkdir(exist_ok=True)
        frames = list(set(range(1, predict_frames[-1] + 2)).difference(set(predict_frames)))
        frames.sort()
        start_time = time.time()
        pred_count = 0
        for prev_num, next_num in pairwise(frames):
            gen_count = next_num - prev_num - 1
            if gen_count == 0:
                continue
            self.save_mid_frames(prev_num, next_num)
            pred_count += gen_count
            print(f"Finished range. total generated={pred_count}/{len(predict_frames)}")
        
        total_time = time.time()-start_time
        print(f"{total_time=}, seconds per frame={total_time/pred_count}")

    def merge_original_frames(self):
        for frame_filename in os.listdir(self.frames_dir):
            if not os.path.exists(os.path.join(self.replaced_dir, frame_filename)):
                shutil.copy(os.path.join(self.frames_dir, frame_filename), os.path.join(self.replaced_dir, frame_filename))
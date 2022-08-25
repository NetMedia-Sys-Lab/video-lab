#!/bin/bash

DIS_VID=/home/akram/ucalgary/research/runs/results-all-072/run_drop-low_long-buffer_av1_Aspen_2sec_beta_quic_01/downloaded/segments/seg-stream2-00005.mp4
REF_VID="/home/akram/ucalgary/research/ramdisk/tmp27llbx3g__tempfs__/seg-stream2-00005.mp4"
VMAF_DIR=/home/akram/ucalgary/research/video-lab/server/third_party/vmaf

docker run -v $REF_VID:$REF_VID -v $DIS_VID:$DIS_VID -v $VMAF_DIR:$VMAF_DIR jrottenberg/ffmpeg:4.4-ubuntu \
  -i $REF_VID \
  -i $DIS_VID \
  -lavfi "[0:v]setpts=PTS-STARTPTS[reference]; \
            [1:v]setpts=PTS-STARTPTS[distorted]; \
            [distorted][reference]libvmaf=log_fmt=json:log_path=/dev/stdout:model_path=$VMAF_DIR/model/vmaf_v0.6.1.json:n_threads=4" \
  -f null - > vmaf.json

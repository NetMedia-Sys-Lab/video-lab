import os
import re
import xml.etree.ElementTree as ET
from copy import deepcopy
from os.path import exists, join
from pathlib import Path
from subprocess import check_call
from xml.dom import minidom

NUM_TILES = 10
NUM_SEGS = 5
dataset_path = "/home/akram/ucalgary/research/beta-emulator-quic/dataset/videos/av1-1sec/Aspen"


def eval_vars(val: str, xml_vars):
    def repl(x: re.Match):
        var_name = x.group(0)[1:-1]
        var_format = None
        if '%' in var_name:
            var_name, var_format = var_name.split("%")
        
        if var_name not in xml_vars:
            return x.group(0)
            
        if var_format is None:
            return str(xml_vars[var_name])
        else:
            return (f"%{var_format}") % xml_vars[var_name]

    return re.sub(r'\$[^\$]+\$', repl, val)

def _pretty_print(current, parent=None, index=-1, depth=0):
    for i, node in enumerate(current):
        _pretty_print(node, current, i, depth + 1)
    if parent is not None:
        if index == 0:
            parent.text = '\n' + ('\t' * depth)
        else:
            parent[index - 1].tail = '\n' + ('\t' * depth)
        if index == len(parent) - 1:
            current.tail = '\n' + ('\t' * (depth - 1))

def make_tiles_mpd(base_dir):
    tiles_dir = join(base_dir, 'tiles')
    merged_mpd_path = join(base_dir, 'output.mpd')
    Path(tiles_dir).mkdir(exist_ok=True)
    
    xml = ET.parse(merged_mpd_path).getroot()

    it = xml.iter()
    for el in it:
        prefix, has_namespace, postfix = el.tag.partition('}')
        if has_namespace:
            el.tag = postfix  # strip all namespaces

    adaptation_set = xml.find(".//AdaptationSet")
    streams = adaptation_set.findall("./Representation") # type: ignore
    num_streams = len(streams)

    xml_vars = {}
    tile_i = 1
    for stream in streams:
        xml_vars['RepresentationID'] = int(stream.get('id', 0))
        t = stream.find("./SegmentTemplate") 
        
        init = str(t.get('initialization')) # type: ignore
        init_file = eval_vars(init, xml_vars)

        for tile_i in range(NUM_TILES):
            tile_init_file = eval_vars(init, {
                **xml_vars,
                'RepresentationID' : tile_i * num_streams + xml_vars['RepresentationID']
            })
            if not exists(join(tiles_dir, tile_init_file)):
                os.symlink(join(base_dir, init_file), join(tiles_dir, tile_init_file))

        media = str(t.get('media')) # type: ignore
        xml_vars['Number'] = int(t.get('startNumber', 0)) # type: ignore
        for s in t.findall('.//S'): # type: ignore
            for r in range(int(s.get('r', 0)) + 1):
                seg_file = eval_vars(media, xml_vars)
                
                for tile_i in range(NUM_TILES):
                    tile_seg_file = eval_vars(media, {
                        **xml_vars,
                        'RepresentationID' : tile_i * num_streams + xml_vars['RepresentationID']
                    })
                    if not exists(join(tiles_dir, tile_seg_file)):
                        os.symlink(join(base_dir, seg_file), join(tiles_dir, tile_seg_file))

                xml_vars['Number'] += 1
        

        for tile_i in range(1, NUM_TILES):
            new_as: ET.Element = deepcopy(adaptation_set)  # type: ignore
            new_as.set('id', str(tile_i))
            for s in new_as.findall("./Representation"):
                s.set('id', str(tile_i * num_streams + int(s.get('id', 0))))
            xml.find('.//Period').append(new_as)  # type: ignore
        
    with open(join(tiles_dir, 'output.mpd'), 'w') as f:
        f.write(ET.tostring(xml).decode())
    


def main():
    print(f"{NUM_TILES=}, {dataset_path=}")
    make_tiles_mpd(dataset_path)


if __name__ == "__main__":
    main()
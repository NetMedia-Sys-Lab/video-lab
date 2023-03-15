#!/bin/bash

set -e

VIDEO_DIR=/home/akram/ucalgary/research/beta-emulator-quic/dataset/videos/hevc-1sec/BBBx2/

cd $VIDEO_DIR

for i in {0..6}; do
    for j in {1..25}; do
        FROM=$(printf "chunk-stream%d-%05d.m4s" $i $j)
        TO=$(printf "chunk-stream%d-%05d.m4s" $i $(( $j + 25 )))
        echo $FROM $TO
        cp $FROM $TO
    done
done
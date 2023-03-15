#!/bin/bash

RUN_DIRS='/home/akram/ucalgary/research/runs/results-quic_cwtest-av1-001/*1sec*'
SUM=0
NUM_DIRS=0
for RUN_DIR in $RUN_DIRS; do
    VIDEO=$(cat $RUN_DIR/config.json | jq -r .video)
    LENGTH=$(cat $RUN_DIR/config.json | jq -r .length)
    CODEC=$(cat $RUN_DIR/config.json | jq -r .codec)

    RAW_DIR="/home/akram/ucalgary/research/beta-emulator-quic/dataset/videos/${CODEC}/${RAW_DIR}-${LENGTH}sec/${VIDEO}"
    
    DOWN_SEGS="$RUN_DIR/downloaded/chunk-stream*"
    for DOWN_SEG in $DOWN_SEGS; do
        echo $DOWN_SEG
        SIZE=$(du -sb "$RAW_DIR/$(basename $DOWN_SEG)" | cut -f1)

        SUM=$(bc -l <<< "$SUM + $SIZE")
        NUM_DIRS=$(bc -l <<< "$NUM_DIRS + 1")
    done
done

echo "Average Segment Size =" $( bc -l <<< "$SUM / $NUM_DIRS")

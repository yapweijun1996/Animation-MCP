#!/bin/bash
# usage: assemble.sh <shot2> <shot3> <shot4> <out.mp4>   (each src: frames dir, .mp4 or .png)
set -e
export PATH=/opt/homebrew/bin:$PATH
cd /Users/admin/workspace/blender-test
T=work_asm; rm -rf $T; mkdir $T
AER=/Users/admin/workspace/malacca/share/malacca-v7-aerial-10s.mp4
AERG="eq=saturation=0.8:contrast=0.94:brightness=0.03:gamma=1.04,colorbalance=rs=0.03:rm=0.02:bs=-0.04"
norm() { # name, src, optional ss
  local n=$1 s=$2 ss=${3:-0}
  local vf="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24,setsar=1,format=yuv420p"
  if [[ "$n" == s1 || "$n" == s5 ]]; then vf="$vf,$AERG,format=yuv420p"; fi
  if [ -d "$s" ]; then ffmpeg -y -loglevel error -framerate 24 -i "$s/%04d.png" -t 3 -vf "$vf" -c:v libx264 -crf 14 -preset veryfast $T/$n.mp4
  elif [[ "$s" == *.png ]]; then ffmpeg -y -loglevel error -loop 1 -framerate 24 -t 3 -i "$s" -vf "$vf" -c:v libx264 -crf 14 -preset veryfast $T/$n.mp4
  else ffmpeg -y -loglevel error -ss $ss -t 3 -i "$s" -vf "$vf" -c:v libx264 -crf 14 -preset veryfast $T/$n.mp4; fi
}
if [ -f aer.done ]; then norm s1 frames8a; else norm s1 $AER 0; fi
norm s2 "$1"
norm s3 "$2"
norm s4 "$3"
if [ -f aer.done ]; then norm s5 frames8b; else norm s5 $AER 7; fi
for n in s1 s2 s3 s4 s5; do echo "file '$n.mp4'" >> $T/list.txt; done
ffmpeg -y -loglevel error -f concat -safe 0 -i $T/list.txt -c copy $T/cat.mp4
/Users/admin/workspace/blender-test/venv/bin/python titles.py
ffmpeg -y -loglevel error -i $T/cat.mp4 -loop 1 -framerate 24 -i title_overlay.png -i audio/mix.m4a -filter_complex \
"[0:v]eq=contrast=1.05:saturation=1.12:gamma=0.96,colorbalance=rs=0.03:bs=-0.03:rh=0.04:bh=-0.02,vignette=PI/5,noise=alls=5:allf=t[g];[1:v]format=rgba,fade=t=in:st=12.2:d=0.8:alpha=1[t];[g][t]overlay=0:0:shortest=1[v]" \
-map "[v]" -map 2:a -t 15 -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$4"
ffprobe -v error -count_frames -show_entries stream=codec_type,width,height,nb_read_frames,duration -of csv=p=0 "$4"

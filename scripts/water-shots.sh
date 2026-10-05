#!/bin/bash
# usage: water-shots.sh <label> [names...]   — writes evidence/<label>/<name>.png
L=$1; shift
mkdir -p evidence/$L
spec() { case $1 in
 clear-overview) echo "foot default 12 clear";;
 rain-overview) echo "foot default 12 rain";;
 storm-overview) echo "foot default 12 storm";;
 night-rain-overview) echo "foot default 22 rain";;
 rain-follow) echo "foot 6,6,8 12 rain";;
 rain-harbor) echo "foot -14,7,26,-4,-0.4,14 12 rain";;
 clear-harbor) echo "foot -14,7,26,-4,-0.4,14 12 clear";;
 rain-shore) echo "foot 30,6,10,19,-0.5,3 12 rain";;
 clear-shore) echo "foot 30,6,10,19,-0.5,3 12 clear";;
 storm-sea) echo "foot 14,5,30,6,-0.6,22 12 storm";;
 rain-fountain) echo "foot 4,3.2,15,0,0.4,8 12 rain";;
 rain-street) echo "foot -3,7.2,16,-3,0.4,6 12 rain";;
 *) echo "unknown $1" >&2; return 1;;
esac; }
NAMES="$@"
[ -z "$NAMES" ] && NAMES="rain-overview clear-overview storm-overview rain-follow rain-harbor clear-harbor rain-shore clear-shore storm-sea rain-fountain rain-street night-rain-overview"
for n in $NAMES; do
  set -- $(spec $n)
  node scripts/shot.mjs evidence/$L/$n.png $1 $2 $3 $4 1440 1000 7000 2>&1 | grep -v -i "experimental\|trace-warnings" | sed "s/^/[$n] /"
done

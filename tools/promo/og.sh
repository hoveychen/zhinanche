# og.sh DIR LANG CAM FOV "poses json array" [DPR]: each pose with and without its shadow, and the courtyard
# without the chariot, for comp3.py (site on PORT_, see still.mjs)
D=$1; L=$2; CAM=$3; FOV=$4; P=$5; DPR=${6:-2}
mkdir -p $D
J=$(python3 -c "
import json,sys
P=json.loads(sys.argv[1]);cam=json.loads(sys.argv[2]);d=sys.argv[3];f=float(sys.argv[4])
j=[]
for i,p in enumerate(P): j+= [{'name':f'{d}/pose{i}','pose':p,'ring':False,'cam':cam,'fov':f},{'name':f'{d}/pose{i}ns','pose':p,'ring':False,'cam':cam,'fov':f,'noShadow':True}]
j.append({'name':f'{d}/bg','ring':False,'cam':cam,'fov':f,'hideCar':True})
print(json.dumps(j))" "$P" "$CAM" $D $FOV)
LANG_=$L SIZE=1200x630 DPR=$DPR JOBS="$J" node still.mjs | grep -v '^photo'

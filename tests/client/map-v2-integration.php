<?php
require __DIR__.'/isolated-app.php';
use App\Domain\GeneratedMapData;
use App\Models\{Game,MapDefinition,MapDraft};
use Illuminate\Support\Facades\{DB,Artisan};
use Illuminate\Validation\ValidationException;
$checks=0;$check=function($ok,$message)use(&$checks){$checks++;if(!$ok)throw new RuntimeException($message);};
foreach([[30,20],[40,30]] as [$columns,$rows])foreach([7,19,37] as $count){
 $file="/tmp/no7-map-v2-{$columns}-{$rows}-{$count}.json";
 $snapshot=json_decode(file_get_contents($file),true,flags:JSON_THROW_ON_ERROR);
 $map=GeneratedMapData::fromArray($snapshot);
 $check(count($map->mapData->territories)===$columns*$rows,'Dimension-aware territory count');
 $check($map->mapData->cellsPerRegion===$count,'Resolution saved');
 $area=array_sum(array_map(fn($t)=>$t->usableLandRatio,$map->mapData->territories));
 $dry=count(array_filter($snapshot['cells'],fn($c)=>!in_array($c[3],['ocean','lake'])))/$count;
 $check(abs($area-$dry)<.00001,'Area normalized independently of resolution');
 echo "Validated {$columns}x{$rows}/{$count}; ".filesize($file)." bytes; peak ".memory_get_peak_usage(true)." bytes\n";
 unset($snapshot,$map);
}
$snapshot=json_decode(file_get_contents('/tmp/no7-map-v2-40-30-7.json'),true,flags:JSON_THROW_ON_ERROR);
foreach(['format','edge','drainage','resource','conflict'] as $case){
 $bad=$snapshot;
 if($case==='format')$bad['format']='hex-beta-1';
 if($case==='edge')$bad['edges'][0][2]='missing';
 if($case==='drainage'){$bad['vertices'][0][11]=$bad['vertices'][0][0];$bad['vertices'][0][12]=$bad['edges'][0][0];}
 if($case==='resource')$bad['resources'][0]['cells'][0][3]=1000000;
 if($case==='conflict')$bad['resourceProfiles'][0]['excludes']=['ore'];
 try{GeneratedMapData::fromArray($bad);throw new RuntimeException("Accepted {$case}");}catch(ValidationException){$checks++;}
}
$map=GeneratedMapData::fromArray($snapshot);
DB::beginTransaction();
try{
 $before=MapDefinition::count();$a=MapDraft::store('V2 first',$map);$b=MapDraft::store('V2 second',$map);
 $check($a->map_definition_id===$b->map_definition_id&&MapDefinition::count()===$before+1,'Immutable map shared once');
 $check($a->getSnapshot()==$snapshot,'Saved fields and names round-trip');
 $game=Game::createNew($map);$id=$game->id;
 $check($game->territories()->count()===1200,'Fresh custom world creates all territories');
 $check($game->map()->first()->map_definition_id===$a->map_definition_id,'Game references exact saved definition');
 $a->delete();$b->delete();$check(MapDefinition::find($game->map()->first()->map_definition_id)!==null,'Library removal preserves game geography');
 $unselected=$snapshot;$unselected['resourceProfiles']=array_values(array_filter($unselected['resourceProfiles'],fn($p)=>$p['key']!=='ore'));$unselected['resources']=array_values(array_filter($unselected['resources'],fn($r)=>$r['key']!=='ore'));
 try{Game::createNew(GeneratedMapData::fromArray($unselected));throw new RuntimeException('Missing required resource accepted');}catch(ValidationException){$checks++;}
 $check(Game::latest('id')->first()->id===$id,'Incompatible game creation rolls back');
}finally{DB::rollBack();}
echo "PASS: {$checks} persistent geography integration checks.\n";

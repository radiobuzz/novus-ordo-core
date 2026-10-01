<?php
require __DIR__ . '/production-lifecycle.php';
use App\Services\Resources\{ResourceCatalogue, ResourceRuleRegistry};
use Illuminate\Support\Facades\DB;
$game=$game->fresh();$turn=$game->getCurrentTurn();$cat=ResourceCatalogue::forGame($game);
$ore=$cat->get('ore');$rule=$ore['rules']['production.territorial_labor'];unset($rule['potential_multiplier']);
DB::table('resource_rules')->where('resource_id',$ore['id'])->where('handler','production.territorial_labor')->update(['parameters'=>json_encode($rule)]);
$rules=$game->economy_rules;$rules['production']['operating_reserve']='1';$game->economy_rules=$rules;$game->policy_testing_enabled=false;$game->save();$game=$game->fresh();
$before=$store->snapshot($game,$turn);
$choices=fn()=>DB::table('nation_policy_choices')->where('game_id',$game->id)->orderBy('id')->get()->toJson();
$pending=fn()=>DB::table('nation_policy_pending_changes')->where('game_id',$game->id)->orderBy('id')->get()->toJson();
$oldChoices=$choices();$oldPending=$pending();
$geo=fn()=>DB::table('territories')->where('game_id',$game->id)->orderBy('id')->pluck('geographic_potential')->all();$oldGeo=$geo();
$result=ResourceCatalogue::calibrateProduction($game,$cat->set['edit_counter']);
$check($result['changed']===true,'Calibration was not installed.');
$check($before===$store->snapshot($game,$turn),'Calibration changed stocks, cash, orders or installed assets.');
$check($oldChoices===$choices()&&$oldPending===$pending(),'Calibration changed policy choices.');
$check($oldGeo===$geo(),'Calibration rewrote saved map geography.');
$check(!$game->fresh()->policy_testing_enabled&&$game->fresh()->getCurrentTurn()->id===$turn->id,'Calibration changed permissions or advanced a turn.');
$current=ResourceCatalogue::forGame($game->fresh());
$check($current->get('ore')['rules']['production.territorial_labor']['potential_multiplier']==='3.000000','Ore conversion not persisted.');
$check($game->fresh()->economy_rules['production']['operating_reserve']==='0.75','Reserve setting not persisted.');
$check(ResourceCatalogue::calibrateProduction($game,$result['edit_counter'])['changed']===false,'Calibration is not idempotent.');
try {ResourceCatalogue::calibrateProduction($game,$cat->set['edit_counter']);throw new RuntimeException('Stale calibration accepted.');}
catch(\Symfony\Component\HttpKernel\Exception\HttpException $e){$check($e->getStatusCode()===409,'Wrong stale-calibration response.');}
foreach(['0','-1','non-geographic'] as $bad){
    $doc=$current->document();foreach($doc['resources'] as &$r)if($r['key']==='ore'){
        if($bad==='non-geographic')$r['rules']['production.territorial_labor']['geographic']=false;
        else $r['rules']['production.territorial_labor']['potential_multiplier']=$bad;
    }unset($r);
    try{app(ResourceRuleRegistry::class)->validate($doc);throw new RuntimeException('Invalid potential multiplier accepted.');}
    catch(\Illuminate\Validation\ValidationException){$check(true,'Invalid multiplier rejected.');}
}
while (($status=$adapter->status($game->fresh()))['next_nation_id']!==null)
    $runner->step($game->fresh(),$status+['nation_id'=>$status['next_nation_id']]);
$forecast=$economy->resolve($nation->fresh()->getDetail($turn));
$next=$game->fresh()->tryNextTurn($turn);
$actual=$nation->fresh()->getDetail($next)->economy_report;unset($actual['deserted_divisions']);
$check($actual===json_decode(json_encode($forecast['report']),true),'Calibrated live forecast differs from settlement.');
$settled=$store->snapshot($game,$next);
$game->fresh()->rollbackLastTurn($next->id);$replayed=$game->fresh()->tryNextTurn($game->fresh()->getCurrentTurn());
$check($settled===$store->snapshot($game,$replayed),'Calibrated rollback/replay differs.');
echo "PASS: resource calibration preserves state, choices, geography and permissions; validation, stale/idempotent, forecast/settlement and replay checks.\n";

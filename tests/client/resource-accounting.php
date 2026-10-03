<?php
require __DIR__.'/isolated-app.php';
set_exception_handler(function (Throwable $error) { fwrite(STDERR, (string) $error . PHP_EOL); exit(1); });
use App\Domain\{DivisionType,DeploymentCommand};
use App\Domain\Resources\Quantity as Q;
use App\Models\{Game,Nation,NationResourceStockpile};
use App\Services\{GameMutation,EconomyService};
use App\Services\Resources\{ResourceCatalogue as Catalogue,ResourceLedger};
use App\Services\Policies\PolicyService;
use Illuminate\Support\Facades\DB;
$count=0;$check=function($ok,$message)use(&$count){++$count;if(!$ok)throw new RuntimeException($message);};
$fixture=json_decode(file_get_contents(getenv('NO7_ENTRY_TEST_ROOT').'/resource-fixture.json'),true);
$game=Game::findOrFail($fixture['game_id']);$nation=Nation::findOrFail($fixture['nation_id']);$turn=$game->getCurrentTurn();
DB::beginTransaction();
try {
 $cat=Catalogue::forGame($game);$detail=$nation->getDetail();$ledger=app(ResourceLedger::class);
 $money=$cat->role('treasury');$stock=$detail->stockpiles()->where('resource_id',$cat->get($money)['id'])->firstOrFail();
 foreach(['0.000000','12345678901234.123456'] as $opening){
  $stock->available_quantity=$opening;$stock->save();
  $d=$nation->fresh()->getDetail();$settings=app(PolicyService::class)->state($nation,$turn)['settings'];
  $forecast=app(EconomyService::class)->forecast($d,$settings)['expected'];
  $expected=Q::add(Q::sub($opening,$forecast['treasury_outflows']),$forecast['treasury_inflows']);
  $check($expected===$forecast['closing_treasury'],'Exact treasury identity at '.$opening);
  $check(Q::cmp($ledger->available($d)['food'],$d->getStockpiledQuantity('food'))<=0,'Private output cannot fund immediate actions');
 }
 $stock->available_quantity='20.000000';$stock->save();
 $home=$detail->territories()->first();
 app(GameMutation::class)->run($game,fn()=>$nation->fresh()->deploy(new DeploymentCommand($home->id,DivisionType::Infantry)));
 $doc=$cat->document();$doc['units']['Infantry']['deployment'][$money]='1000';
 Catalogue::edit($cat->set['id'],$cat->set['edit_counter'],$doc);
 $currentTurns=$game->turns()->count();
 try{$game->fresh()->tryNextTurn($turn);throw new RuntimeException('Unpaid deployment executed');}
 catch(\Illuminate\Validation\ValidationException $e){$check(str_contains(json_encode($e->errors()),'Accepted actions exceed'),'Unpaid turn has actionable rejection');}
 $check($game->turns()->count()===$currentTurns,'Failed settlement rolled back destination state');
 $foreign=DB::table('resource_definitions')->where('key','money')->where('resource_set_id','!=',$cat->set['id'])->first();
 DB::beginTransaction();
 try{$stock->resource_id=$foreign->id;$stock->save();$ledger->preview($nation->fresh()->getDetail());throw new RuntimeException('Foreign stock accepted');}
 catch(\DomainException $e){$check($e->getMessage()==='Foreign stock resource.','Foreign state reference rejected');}
 finally{DB::rollBack();}
 echo "$count additional accounting checks passed.\n";
}finally{DB::rollBack();}

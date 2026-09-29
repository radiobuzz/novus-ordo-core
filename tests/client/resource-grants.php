<?php
require __DIR__.'/isolated-app.php';
set_exception_handler(function (Throwable $error) { fwrite(STDERR, (string) $error . PHP_EOL); exit(1); });
use App\Models\{Game,Nation};
use App\Services\{NationCommunicationService,AdminGameService};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
$f=json_decode(file_get_contents(getenv('NO7_ENTRY_TEST_ROOT').'/diplomacy-fixture.json'),true);
$g=Game::findOrFail($f['game_id']);$a=Nation::findOrFail($f['nations'][0]);$b=Nation::findOrFail($f['nations'][1]);
DB::beginTransaction();
try{
 $g->diplomacy_enabled=true;$g->save();$a->setRelation('game',$g);$b->setRelation('game',$g);
 $service=app(NationCommunicationService::class);
 $offer=$service->propose($a,$b->id,\App\Domain\NationOfferKind::ResourceGrant,(string)Str::uuid(),'money','0.123456');
 $conversation=$service->conversation($b,$a->id);
 if($conversation['messages'][0]['offer']['resource_key']!=='money')throw new RuntimeException('Grant export key missing');
 $before=$b->getDetail()->getStockpiledQuantity('money');
 $service->respond($b,$offer['offer_id'],'accept');
 if($b->fresh()->getDetail()->getStockpiledQuantity('money')!==\App\Domain\Resources\Quantity::add($before,'0.123456'))throw new RuntimeException('Grant not settled');
 app(AdminGameService::class)->lifecycle($g,'delete',$g->turn_context_revision);
 echo "Grant offer/export/accept and game deletion with grants passed (rolled back).\n";
}finally{DB::rollBack();}

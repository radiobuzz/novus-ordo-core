<?php
require __DIR__.'/../../vendor/autoload.php';
use App\Domain\Resources\{GeographicProduction as G};
$rule=['geographic'=>true,'yields'=>['Plain'=>'4','Mountain'=>'2','Water'=>'0']];
$geography=['resources'=>['ore'=>['capacity'=>.1,'terrainWeights'=>['Plain'=>.025]]]];
$f=G::facility($rule,'ore',$geography,'Plain',10000000);
if($f['capacity']!==25000||$f['productivity']!=='4.000000')throw new RuntimeException('Tiny deposit did not bound workers');
if(G::facility($rule,'copper',$geography,'Plain',10000000)['capacity']!==0)throw new RuntimeException('Resource identity substituted');
if(G::facility($rule,'ore',$geography,'Plain',100)['capacity']!==100)throw new RuntimeException('Available workers ignored');
if(G::facility($rule,'ore',[],'Plain',10000000)['capacity']!==0)throw new RuntimeException('Missing geography created a deposit');
echo "PASS: geographic worker cap, exact resource identity, missing deposits and available workers.\n";

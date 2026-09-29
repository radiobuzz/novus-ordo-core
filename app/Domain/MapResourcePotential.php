<?php
namespace App\Domain;
use Illuminate\Validation\ValidationException;

final class MapResourcePotential
{
    public static function aggregate(array $data, array $cells): array {
        $fail = fn ($message = 'Invalid map resource data.') => throw ValidationException::withMessages(['map' => $message]);
        $finite = fn ($v) => (is_int($v) || is_float($v)) && is_finite((float)$v) && $v >= 0 && $v <= 1e12;
        $profiles = [];
        if (count($data['resourceProfiles']) > 64) $fail();
        foreach ($data['resourceProfiles'] as $p) {
            if (!is_array($p)) $fail();
            \Illuminate\Support\Facades\Validator::make($p, [
                'labels.en'=>'required|string|max:120', 'labels.fr'=>'sometimes|string|max:120',
                'unit'=>'required|string|max:64', 'version'=>'required|integer|min:1',
                'habitats'=>'required|array|max:3', 'habitats.*'=>'required|string|in:land,lake,ocean|distinct',
                'excludes'=>'present|array|max:64', 'excludes.*'=>'required|string|regex:/^[a-z][a-z0-9_]{0,63}$/',
                'affinities'=>'required|array:plains,hills,mountain,water', 'affinities.*'=>'required|numeric|between:0,10',
            ])->validate();
            if (!is_array($p) || !is_string($p['key'] ?? null) || !preg_match('/^[a-z][a-z0-9_]{0,63}$/D',$p['key']) || isset($profiles[$p['key']])) $fail();
            if (!in_array($p['method'] ?? null, ['agriculture','surface','forest','deposit'], true) || !is_string($p['unit'] ?? null) || !is_array($p['excludes'] ?? null)) $fail();
            foreach (['abundance'=>100,'concentration'=>100,'richness'=>200] as $key=>$max) if (!$finite($p[$key]??null) || $p[$key]>$max) $fail();
            foreach (['baseQuantity','baseCapacity'] as $key) if (!$finite($p[$key]??null)) $fail();
            if (!is_array($p['habitats']??null) || array_diff($p['habitats'],['land','lake','ocean']) || !is_array($p['affinities']??null)) $fail();
            foreach($p['affinities'] as $weight) if(!$finite($weight))$fail();
            $profiles[$p['key']]=$p;
        }
        foreach($profiles as $p)foreach($p['excludes'] as $key)if(isset($profiles[$key]))$fail('Conflicting geographic resource selections.');
        $result=array_fill(0,$data['regionColumns']*$data['regionRows'],['landFraction'=>0,'agriculturalSuitability'=>0,'terrainFractions'=>[],'climate'=>['temperature'=>0,'rainfall'=>0,'moisture'=>0],'resources'=>[]]);
        foreach($cells as $c) {
            $region=&$result[$c[2]];
            $terrain=self::terrain($c);
            $region['terrainFractions'][$terrain]=($region['terrainFractions'][$terrain]??0)+1/$data['cellCount'];
            if(!$finite($c[28])||$c[28]>1)$fail();
            if($terrain!=='Water'){
                $region['landFraction']+=1/$data['cellCount'];
                foreach(['temperature'=>8,'rainfall'=>15,'moisture'=>9] as $field=>$index)$region['climate'][$field]+=$c[$index]/$data['cellCount'];
            }
            $region['agriculturalSuitability']+=$c[28]/$data['cellCount'];
            unset($region);
        }
        foreach($result as &$region)foreach($region['climate'] as &$mean)$mean=$region['landFraction']>0?$mean/$region['landFraction']:null;
        unset($region,$mean);
        $seen=[];
        foreach($data['resources'] as $resource) {
            $key=$resource['key']??null;
            if(!is_string($key)||!isset($profiles[$key])||isset($seen[$key])||!is_array($resource['cells']??null))$fail();
            $seen[$key]=true;$members=[];$p=$profiles[$key];
            foreach($resource['cells'] as $entry) {
                if(!is_array($entry)||!array_is_list($entry)||count($entry)!==4||!is_string($entry[0])||!isset($cells[$entry[0]])||isset($members[$entry[0]]))$fail();
                foreach([1,2,3] as $i)if(!$finite($entry[$i]))$fail();
                $members[$entry[0]]=true;$c=$cells[$entry[0]];
                $habitat=in_array($c[3],['ocean','lake'],true)?$c[3]:'land';
                if(!in_array($habitat,$p['habitats'],true))$fail();
                $depth=$habitat==='ocean'?max(0,-$c[14]):($c[26]??0);
                if(isset($p['maxDepth'])&&(!$finite($p['maxDepth'])||$depth>$p['maxDepth']))$fail();
                if(abs($entry[2]-$entry[1]*$p['baseQuantity']/$data['cellCount'])>0.00001)$fail();
                $access=$habitat==='land'?1/(1+($c[18]??0)/1800):0.3;
                if(abs($entry[3]-$entry[1]*$p['baseCapacity']*$access/$data['cellCount'])>0.00001)$fail();
                $region=&$result[$c[2]];
                $region['resources'][$key]??=['quantity'=>0,'capacity'=>0,'terrainWeights'=>[]];
                $r=&$region['resources'][$key];$r['quantity']+=$entry[2];$r['capacity']+=$entry[3];$terrain=self::terrain($c);
                $r['terrainWeights'][$terrain]=($r['terrainWeights'][$terrain]??0)+$entry[1]/$data['cellCount'];
                unset($r,$region);
            }
        }
        if(count($seen)!==count($profiles))$fail('Every selected resource needs an explicit distribution, including zero abundance.');
        return $result;
    }
    private static function terrain(array $c): string {
        return in_array($c[3],['ocean','lake'])?'Water':($c[4]==='mountain'?'Mountain':(in_array($c[3],['snow','tundra'])?'Tundra':($c[19]==='desert'?'Desert':($c[5]==='forest'?'Forest':'Plain'))));
    }
}

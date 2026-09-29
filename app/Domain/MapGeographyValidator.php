<?php
namespace App\Domain;

use Illuminate\Validation\ValidationException;

/** Referential validation for the persisted hydrological graph and geographic annotations. */
final class MapGeographyValidator
{
    public static function validate(array $data, array $cells): void
    {
        $fail = fn () => throw ValidationException::withMessages(['map' => 'Invalid geographic fields or topology.']);
        $number = fn ($v) => (is_int($v) || is_float($v)) && is_finite((float) $v) && abs($v) <= 1e12;
        $vertices = [];
        foreach ($data['vertices'] as $v) {
            if (!is_array($v) || !array_is_list($v) || count($v) !== 13 || !is_string($v[0]) || isset($vertices[$v[0]])) $fail();
            foreach ([1,2,3,4,5,6,9] as $i) if (!$number($v[$i])) $fail();
            if (!is_bool($v[7]) || !is_int($v[9]) || $v[5] < 0 || $v[6] < 0) $fail();
            if ($v[10] !== null && !$number($v[10])) $fail();
            if ($v[1] < 0 || $v[1] > $data['width'] || $v[2] < 0 || $v[2] > $data['height']) $fail();
            if (!preg_match('/^(-?\d+),(-?\d+)$/D',$v[0],$coordinates)) $fail();
            $radius=[7=>1,19=>2,37=>3][$data['cellCount']];
            $size=174/(sqrt(3)*(2*$radius+1));
            if (abs($v[1]-($data['offsetX']+((int)$coordinates[1]*sqrt(3)*$size)/2))>.00001 || abs($v[2]-($data['offsetY']+((int)$coordinates[2]*$size)/2))>.00001) $fail();
            $vertices[$v[0]] = $v;
        }
        $edges = [];
        $physicalEdges = [];
        $cellEdges = [];
        foreach ($data['edges'] as $e) {
            if (!is_array($e) || !array_is_list($e) || count($e) !== 7 || !is_string($e[0]) || isset($edges[$e[0]])) $fail();
            if (!is_array($e[1]) || !in_array(count($e[1]), [1,2]) || count(array_unique($e[1])) !== count($e[1])) $fail();
            if (!is_string($e[2]) || !is_string($e[3]) || !isset($vertices[$e[2]], $vertices[$e[3]]) || $e[2] === $e[3] || !$number($e[4]) || $e[4] < 0) $fail();
            foreach ($e[1] as $id) {
                if (!is_string($id) || !isset($cells[$id])) $fail();
                $cellEdges[$id] = ($cellEdges[$id] ?? 0) + 1;
                [$q, $r] = $cells[$id];
                $corners = [];
                foreach ([[1,-1],[1,1],[0,2],[-1,1],[-1,-1],[0,-2]] as [$dx,$dy]) $corners[] = (2*$q+$r+$dx).','.(3*$r+$dy);
                if (!in_array($e[2], $corners, true) || !in_array($e[3], $corners, true)) $fail();
                $a = array_search($e[2], $corners, true); $b = array_search($e[3], $corners, true);
                if (!in_array(abs($a-$b), [1,5])) $fail();
            }
            if (($e[5] === null) !== ($e[6] === null)) $fail();
            if ($e[5] !== null && (!in_array($e[5], [$e[2],$e[3]], true) || !in_array($e[6], [$e[2],$e[3]], true) || $e[5] === $e[6])) $fail();
            $physical = [$e[2],$e[3]]; sort($physical); $physical = implode('|',$physical);
            if (isset($physicalEdges[$physical])) $fail();
            $physicalEdges[$physical] = true;
            $edges[$e[0]] = $e;
        }
        foreach ($cells as $id => $c) {
            if (($cellEdges[$id] ?? 0) !== 6) $fail();
            foreach ([14,15,16,20,21,24] as $i) if (!$number($c[$i])) $fail();
            foreach ([18,25,26] as $i) if ($c[$i] !== null && !$number($c[$i])) $fail();
            if (!is_bool($c[17]) || !in_array($c[19], ['ocean','lake','snow','tundra','desert','drylands','forest','grassland'], true)) $fail();
            foreach ([8,9,15,20] as $i) if ($c[$i] < 0 || $c[$i] > 1) $fail();
            if (abs($c[16]) > 90 || !is_string($c[22]) || !is_string($c[23]) || !isset($vertices[$c[22]], $vertices[$c[23]])) $fail();
            if ($c[3] === 'lake' && ($c[25] === null || $c[26] === null || $c[26] < 0 || abs($c[25]-$c[10]-$c[26]) > 0.001)) $fail();
        }
        foreach ($vertices as $v) {
            if (!is_string($v[8]) || !isset($vertices[$v[8]]) || $vertices[$v[8]][11] !== null) $fail();
            if ($v[11] === null) { if ($v[12] !== null) $fail(); continue; }
            if (!is_string($v[11]) || !is_string($v[12]) || !isset($vertices[$v[11]], $edges[$v[12]])) $fail();
            $next = $vertices[$v[11]]; $e = $edges[$v[12]];
            if ($next[9] >= $v[9] || $next[8] !== $v[8] || !in_array($v[0], [$e[2],$e[3]], true) || !in_array($next[0], [$e[2],$e[3]], true)) $fail();
        }
        foreach (['breaches','totalRunoff','outletFlow'] as $key) if (!$number($data['drainage'][$key] ?? null) || $data['drainage'][$key] < 0) $fail();
        $features = [];
        foreach ($data['features'] as $f) {
            if (!is_array($f) || !is_string($f['id'] ?? null) || isset($features[$f['id']]) || !is_string($f['name'] ?? null) || (mb_strlen($f['name']) > 120 || trim($f['name']) === '')) $fail();
            if (!in_array($f['type'] ?? null, ['ocean','continent','island','river','lake','bay','mountain'], true) || !is_array($f['cellIds'] ?? null) || !is_array($f['relations'] ?? null)) $fail();
            foreach ($f['cellIds'] as $id) if (!is_string($id) || !isset($cells[$id])) $fail();
            foreach ($f['edgeIds'] ?? [] as $id) if (!is_string($id) || !isset($edges[$id])) $fail();
            foreach (['x','y'] as $axis) if (!$number($f['anchor'][$axis] ?? null)) $fail();
            $features[$f['id']] = $f;
        }
        foreach ($features as $f) foreach ($f['relations'] as $r) if (!is_string($r['featureId'] ?? null) || !isset($features[$r['featureId']])) $fail();
        $shores = [];
        foreach ($data['coasts'] as $s) {
            if (!is_array($s) || !is_string($s['landId'] ?? null) || !is_string($s['waterId'] ?? null) || !isset($cells[$s['landId']], $cells[$s['waterId']])) $fail();
            if (!is_string($s['id'] ?? null) || isset($shores[$s['id']]) || ($s['waterType'] ?? null) !== $cells[$s['waterId']][3]) $fail();
            $shores[$s['id']] = true;
            if (in_array($cells[$s['landId']][3], ['lake','ocean']) || !in_array($cells[$s['waterId']][3], ['lake','ocean'])) $fail();
            if (!$number($s['exposure'] ?? null) || $s['exposure'] < 0 || $s['exposure'] > 1 || !is_bool($s['truncated'] ?? null)) $fail();
            foreach (['accessGrade','exposureGrade'] as $key) if (!is_int($s[$key] ?? null) || $s[$key]<0 || $s[$key]>3) $fail();
            foreach (['surface','shoreRise','inlandRise','ground'] as $key) if (!array_key_exists($key,$s) || ($s[$key]!==null && !$number($s[$key]))) $fail();
            if (!is_array($s['edge'] ?? null) || count($s['edge'])!==2 || !is_array($s['midpoint'] ?? null) || !is_array($s['reasons'] ?? null)) $fail();
            foreach ([...$s['edge'],$s['midpoint']] as $point) foreach (['x','y'] as $axis) if (!$number($point[$axis] ?? null)) $fail();
            foreach ($s['reasons'] as $reason) if (!is_string($reason)) $fail();
        }
        foreach ($data['lakes'] as $lake) {
            if (!is_array($lake) || !is_array($lake['cellIds'] ?? null) || !$number($lake['waterLevel'] ?? null)) $fail();
            foreach ($lake['cellIds'] as $id) if (!isset($cells[$id]) || $cells[$id][3] !== 'lake' || $cells[$id][27] !== ($lake['id'] ?? null)) $fail();
        }
    }
}

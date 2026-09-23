<?php

namespace App\Domain;

use App\Facades\Metacache;
use App\Models\Division;
use App\Models\NationDetail;
use Closure;
use Illuminate\Support\Collection;
use InvalidArgumentException;

readonly class Ranking {
    private Closure $valuePostProcessing;

    private function __construct(
        public string $key,
        public string $title,
        private Closure $valueGetter,
        private int $sortOrder,
        public StatUnit $unit,
        ?Closure $valuePostProcessing = null,
    )
    {
        if ($sortOrder != SORT_ASC && $sortOrder != SORT_DESC) {
            throw new InvalidArgumentException("sortOrder: must be either SORT_ASC or SORT_DESC");
        }

        $this->valuePostProcessing = is_null($valuePostProcessing) ? fn (mixed $v) => $v : $valuePostProcessing;
    }

    public static function rankNations(NationDetail ...$nationDetails): array {
        $nationDetails = collect($nationDetails);
        $rankingMetas = Ranking::getRankings();
        $rankings = [];

        foreach ($rankingMetas as $rankingMeta) {
            assert($rankingMeta instanceof Ranking);

            $rankings[] = $rankingMeta->rankValues(
                $nationDetails->mapWithKeys(fn (NationDetail $d) => [$d->getNationId() => ($rankingMeta->valueGetter)($d)])
            );
        }

        return $rankings;
    }

    private static function guessScaleAndApproximate(float $value): int {
        $scale = pow(10, max(1, floor(log($value, 10))));

        return round($value / $scale) * $scale;
    }

    public function rankValues(iterable $valuesByNation): Collection {
        return collect($valuesByNation)
            ->sortBy(fn ($v) => $v, descending: $this->sortOrder == SORT_DESC)
            ->mapWithKeys(fn ($v, int $nationId) => [$nationId => ($this->valuePostProcessing)($v)]);
    }

    public static function getRankings(): array {
        return [
            new Ranking('land_area', 'Land area', fn (NationDetail $d) => Metacache::remember($d->getUsableLandKm2(...)), SORT_DESC, StatUnit::Km2),
            new Ranking('territories', 'Number of territories', fn (NationDetail $d) => $d->territories()->count(), SORT_DESC, StatUnit::WholeNumber),
            new Ranking('population', 'Population', fn (NationDetail $d) => $d->getPopulationSize(), SORT_DESC, StatUnit::WholeNumber),
            new Ranking('army_size', 'Army size (number of divisions)', fn (NationDetail $d) => $d->activeDivisions()->count(), SORT_DESC, StatUnit::ApproximateNumber, valuePostProcessing: fn (int $count) => Division::approximateNumberOfDivisions($count)),
            new Ranking('wealth', 'Wealth (capital reserves)', fn (NationDetail $d) => $d->getStockpiledQuantity(ResourceType::Capital), SORT_DESC, StatUnit::ApproximateNumber, valuePostProcessing: fn (float $reserves) => Ranking::guessScaleAndApproximate($reserves)),
        ];
    }
}

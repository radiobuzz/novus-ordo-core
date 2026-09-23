<?php

namespace App\Http\Requests;

use App\Domain\ProductionBidConstants;
use App\Domain\ResourceType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProductionPlanRequest extends FormRequest
{
    public function rules(): array {
        $resources = collect(ResourceType::cases())
            ->filter(fn (ResourceType $type) => ResourceType::getMeta($type)->canPlaceCommand)
            ->map(fn (ResourceType $type) => $type->name)->values()->all();
        return [
            'bids' => ['required', 'array', 'size:' . count($resources)],
            'bids.*' => ['required', 'array:resource_type,max_quantity,max_labor_allocation_per_unit'],
            'bids.*.resource_type' => ['required', 'string', 'distinct:strict', Rule::in($resources)],
            'bids.*.max_quantity' => ['required', 'integer', 'min:0', 'max:' . ProductionBidConstants::MAX_QUANTITY_LIMIT],
            'bids.*.max_labor_allocation_per_unit' => ['required', 'integer', 'min:0', 'max:' . ProductionBidConstants::MAX_LABOR_PER_UNIT_LIMIT],
        ];
    }
}

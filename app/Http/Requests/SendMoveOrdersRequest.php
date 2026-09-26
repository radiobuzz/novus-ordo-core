<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SendMoveOrdersRequest extends FormRequest {
    public readonly array $orders;

    private readonly array $moveOrders;

    public function passedValidation(): void {
        $orders = $this->validated('orders');

        $this->moveOrders = array_map(function (array $data) {
                if (!isset($data['path_territory_ids'])) {
                    $data['path_territory_ids'] = [];
                }

                return SentMoveOrder::fromArray($data);
            },
            $orders
        );
    }

    public function getMoveOrders(): array {
        return $this->moveOrders;
    }

    public function rules(): array
    {
        // NationCommands validates active ownership and all territory IDs once for the whole batch,
        // inside the command lock. Per-item existence queries here would duplicate that work.
        return [
            'orders' => 'required|array|min:1',
            'orders.*.division_id' => [
                'required',
                'integer',
            ],
            'orders.*.destination_territory_id' => [
                'required',
                'integer',
            ],
            'orders.*.path_territory_ids' => [
                'nullable',
                'array',
            ],
            'orders.*.path_territory_ids.*' => [
                'integer',
            ],
        ];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SendDisbandOrdersRequest extends FormRequest {
    public readonly array $orders;

    private readonly array $disbandOrders;

    public function passedValidation(): void {
        $orders = $this->validated('orders');

        $this->disbandOrders = array_map(fn (array $data) => SentDisbandOrder::fromArray($data), $orders);
    }

    public function getDisbandOrders(): array {
        return $this->disbandOrders;
    }

    public function rules(): array
    {
        // NationCommands checks active ownership for the whole batch inside the command lock.
        return [
            'orders' => 'required|array|min:1',
            'orders.*.division_id' => [
                'required',
                'integer',
            ],
        ];
    }
}

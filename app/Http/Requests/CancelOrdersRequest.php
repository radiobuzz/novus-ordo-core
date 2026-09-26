<?php

namespace App\Http\Requests;

use App\Utils\MapsValidatedDataToFormRequest;
use Illuminate\Foundation\Http\FormRequest;

class CancelOrdersRequest extends FormRequest {
    use MapsValidatedDataToFormRequest;

    public readonly array $division_ids;

    public function rules(): array
    {
        // NationCommands checks active ownership for the whole batch inside the command lock.
        return [
            'division_ids' => 'required|array|min:1',
            'division_ids.*' => [
                'required',
                'integer',
            ]
        ];
    }
}

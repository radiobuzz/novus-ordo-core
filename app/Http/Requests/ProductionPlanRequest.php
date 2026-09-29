<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class ProductionPlanRequest extends FormRequest {
    public function rules(): array { return self::planRules(); }
    public static function planRules(): array {
        return ['turn_id' => 'required|integer|min:1', 'edit_counter' => 'required|integer|min:1', 'changes' => 'present|array|max:500',
            'client_context.turn_context_revision' => 'required|uuid', 'acquisitions' => 'present|array|max:500',
            'acquisitions.*' => 'required|array:resource_key,quantity,spending_limit,priority',
            'acquisitions.*.resource_key' => 'required|string|distinct:strict',
            'acquisitions.*.quantity' => ['required', 'string', 'regex:/^\d+(?:\.\d{1,6})?$/D'],
            'acquisitions.*.spending_limit' => ['required', 'string', 'regex:/^\d+(?:\.\d{1,6})?$/D'],
            'acquisitions.*.priority' => 'required|integer|min:0|max:2147483647'];
    }
}

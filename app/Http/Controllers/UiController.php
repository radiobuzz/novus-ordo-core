<?php

namespace App\Http\Controllers;

use App\Models\Game;
use App\Models\NewNation;
use App\Models\Territory;
use App\Models\Turn;
use App\Models\User;
use App\Models\UserCredentials;
use App\Models\UserCredentialsRejected;
use App\Models\UserLogedIn;
use App\ReadModels\GameReadyStatusInfo;
use App\Services\LoggedInGameContext;
use App\Services\NationContext;
use App\Services\NationCreationService;
use App\Utils\Annotations\Response;
use App\Utils\Annotations\Summary;
use App\Utils\MapsValidatedDataToFormRequest;
use App\Utils\MapsValidatorToInstance;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CreateNationUiRequest extends FormRequest
{
    use MapsValidatedDataToFormRequest;

    public string $nation_name;
    public ?string $nation_formal_name;
    public string $leader_name;
    public ?string $leader_title;
    public readonly array $territory_ids;

    public function __construct(private readonly LoggedInGameContext $context) {}

    protected function prepareForValidation(): void
    {
        $selection = $this->input('territory_ids_as_json', '[]');
        $this->merge([
            'territory_ids' => is_string($selection) ? json_decode($selection, true) : null,
        ]);
    }

    public function rules(): array
    {
        return [
            'nation_flag' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048', 'dimensions:max_width=4096,max_height=4096'],
            'primary_color_id' => ['nullable', 'required_with:secondary_color_id', 'integer', Rule::exists('nation_colors', 'id')->where('primary_allowed', true)],
            'secondary_color_id' => ['nullable', 'required_with:primary_color_id', 'integer', Rule::exists('nation_colors', 'id')],
            'leader_picture' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048', 'dimensions:max_width=4096,max_height=4096'],
            'nation_name' => [
                'required',
                'string',
                'min:2',
                'max:100',
                NewNation::createRuleNoNationWithSameNameInGameUnlessItsOwner($this->context->getGame(), $this->context->getUser()),
            ],
            'nation_formal_name' => ['nullable', 'string', 'min:2', 'max:1024'],
            'leader_name' => ['required', 'string', 'min:2', 'max:1024'],
            'leader_title' => ['nullable', 'string', 'min:2', 'max:1024'],
            'territory_ids' => [
                'required',
                'array',
                'min:' . Game::NUMBER_OF_STARTING_TERRITORIES,
                'max:' . Game::NUMBER_OF_STARTING_TERRITORIES,
                function ($attribute, $value, $fail) {
                    if (!is_array($value)) return;
                    $rule = Territory::createValidationSuitableHomeTerritory($this->context->getGame());
                    $rule($attribute, $value, fn () => $fail(__('entry.territories')));
                },
            ],
        ];
    }
}

readonly class UserLoginRequest
{
    use MapsValidatorToInstance;

    public function __construct(
        public string $username,
        public string $password,
    ) {}
}

class ReadyForNextTurnRequest extends FormRequest
{
    use MapsValidatedDataToFormRequest;

    public readonly int $turn_number;

    public function __construct(private readonly LoggedInGameContext $context) {}

    public function rules(): array
    {
        return [
            'turn_number' => [
                'required',
                'int',
                'min:1',
                Rule::exists(Turn::class, Turn::FIELD_TURN_NUMBER)
                    ->where('game_id', $this->context->getGame()->getId()),
            ],
        ];
    }
}

class UiController extends Controller
{
    public function storeNation(
        CreateNationUiRequest $request,
        LoggedInGameContext $context,
        NationCreationService $creation,
    ): RedirectResponse|JsonResponse {
        $nation = $creation->create($request, $context);
        if ($request->expectsJson()) {
            return response()->json(['nation_id' => $nation->getId(), 'status' => 'FinishedSetup'], 201);
        }
        return redirect()->route('client', ['game_id' => $context->getGame()->getId()]);
    }

    public function loginUser(Request $request): RedirectResponse|JsonResponse
    {
        $httpRequest = $request;
        $validated = $request->validate([
            'username' => 'required|string|min:1',
            'password' => 'required|string|min:1',
        ]);
        $request = UserLoginRequest::fromArray($validated);
        $loginResult = User::login(new UserCredentials($request->username, $request->password));

        if ($httpRequest->expectsJson()) {
            if ($loginResult instanceof UserLogedIn) return response()->json(EntryController::boot($httpRequest));
            return response()->json(['errors' => ['username' => [__('entry.credentials')]]], 422);
        }

        return match (true) {
            $loginResult instanceof UserLogedIn => redirect()->route('client'),
            $loginResult instanceof UserCredentialsRejected => back()->withErrors([
                'username' => 'Credentials rejected.',
            ])->onlyInput('username'),
        };
    }

    #[Summary('Notify the server that the current nation owner is ready to end the current turn.')]
    #[Response(GameReadyStatusInfo::class)]
    public function readyForNextTurn(NationContext $context, ReadyForNextTurnRequest $request): JsonResponse
    {
        $game = $context->getGame();
        $turn = Turn::getForGameByNumberOrNull($game, $request->turn_number);
        $context->getNation()->readyForNextTurn($turn);
        $game->tryNextTurnIfNationsReady($turn);

        return response()->json($game->exportReadyStatus());
    }
}

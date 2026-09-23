<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Models\{Game, User, Nation, NewNation, NationDetail, TerritoryDetail};
use Illuminate\Support\Facades\Auth;
function checkEntry(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
$game = Game::getCurrent();
$complete = Nation::getForUserOrNull($game, User::where('name', 'entry-player')->firstOrFail());
checkEntry($complete !== null, 'Created nation missing');
$detail = $complete->getDetail();
checkEntry($detail->formal_name === 'The Integration Republic', 'Formal identity not preserved');
$images = glob(public_path('var/entry-*.png'));
checkEntry(count($images) === 2, 'Expected flag and leader portrait');
$sizes = array_map(fn ($image) => join('x', array_slice(getimagesize($image), 0, 2)), $images);
sort($sizes); checkEntry($sizes === ['200x400', '300x200'], 'Image crop dimensions differ');
checkEntry(TerritoryDetail::where('owner_nation_id', $complete->getId())->count() === Game::NUMBER_OF_STARTING_TERRITORIES, 'Territory assignment mismatch');

$user = User::where('name', 'entry-recovery')->firstOrFail(); Auth::login($user);
$context = new App\Services\LoggedInGameContext();
class_exists(App\Http\Controllers\UiController::class);
$available = $game->freeSuitableTerritoriesInTurn()->get(); $ids = [];
foreach ($available as $first) {
    $candidate = [$first->getId()];
    for ($i=0; $i<count($candidate) && count($candidate)<Game::NUMBER_OF_STARTING_TERRITORIES; $i++) {
        foreach ($available->firstWhere('id', $candidate[$i])->connectedLands()->pluck('connected_territory_id') as $id) {
            if ($available->contains('id', $id) && !in_array($id, $candidate) && count($candidate)<Game::NUMBER_OF_STARTING_TERRITORIES) $candidate[]=$id;
        }
    }
    if (count($candidate)===Game::NUMBER_OF_STARTING_TERRITORIES) { $ids=$candidate; break; }
}
$request = new App\Http\Controllers\CreateNationUiRequest($context);
Illuminate\Http\Request::createFrom(Illuminate\Http\Request::create('/create-nation', 'POST'), $request);
$request->setContainer($app)->setRedirector(app('redirect'));
$request->replace(['nation_name'=>'Recovery Republic', 'nation_formal_name'=>'Recovery Republic', 'leader_name'=>'Recovery Leader', 'leader_title'=>'President', 'territory_ids_as_json'=>json_encode($ids)]);
$request->files->set('nation_flag', Illuminate\Http\UploadedFile::fake()->image('flag.png', 300, 200));
$request->validateResolved();
$before = NationDetail::count();
NationDetail::created(fn () => throw new RuntimeException('entry-injected-finalization-failure'));
try {
    app(App\Services\NationCreationService::class)->create($request, $context);
    throw new RuntimeException('Injected failure was not raised');
} catch (RuntimeException $error) {
    checkEntry($error->getMessage()==='entry-injected-finalization-failure', 'Unexpected failure: ' . $error->getMessage());
}
checkEntry(NationDetail::count()===$before, 'Failed finalization left a nation detail');
checkEntry(Nation::getForUserOrNull($game,$user)===null, 'Failed finalization was marked complete');
checkEntry(NewNation::getForUserOrNull($game,$user)!==null, 'Pending identity should remain recoverable');
checkEntry(count(glob(public_path('var/entry-*.png')))===2, 'Failed upload was not cleaned up');
echo "PASS: persisted identity, two resized uploads, exact territory count, injected finalization rollback, recoverable pending identity and failed-upload cleanup.\n";

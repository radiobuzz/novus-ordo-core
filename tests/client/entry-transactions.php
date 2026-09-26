<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Models\{Game, User, Nation, NewNation, NationDetail, TerritoryDetail};
use Illuminate\Support\Facades\Auth;
function checkEntry(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
$game = Game::getCurrent();
$complete = Nation::getForUserOrNull($game, User::where('name', 'entry-player')->firstOrFail());
checkEntry($complete !== null, 'Created nation missing');
$detail = $complete->getDetail();
$designedFlag = getenv('NO7_TEST_DESIGNED_FLAG') === '1';
if ($designedFlag) {
    $recipe = App\Services\FlagDesign::parse(json_encode($detail->flag_design));
    checkEntry(count($recipe['flag']['layers']) > 0, 'Editable flag was not persisted');
    checkEntry($recipe['flag']['width'] === 900 && $recipe['flag']['height'] === 600, 'Master flag size changed');
    $replica = $detail->replicate();
    checkEntry($replica->flag_design === $recipe, 'Turn replication lost the recipe');
} else checkEntry($detail->flag_design === null, 'Uploaded flags must not invent a recipe');
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
$request->files->set('nation_flag', Illuminate\Http\UploadedFile::fake()->image('flag.png', $designedFlag ? 900 : 300, $designedFlag ? 600 : 200));
if ($designedFlag) $request->merge(['flag_design' => json_encode($recipe)]);
$request->validateResolved();
$before = NationDetail::count();
if ($designedFlag) NationDetail::updated(function (NationDetail $record) {
    if ($record->flag_design !== null) throw new RuntimeException('entry-injected-finalization-failure');
});
else NationDetail::created(fn () => throw new RuntimeException('entry-injected-finalization-failure'));
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
echo ($designedFlag ? "PASS: persisted editable design, replication and recipe-write rollback. " : "") . "PASS: persisted identity, two resized uploads, exact territory count, injected finalization rollback, recoverable pending identity and failed-upload cleanup.\n";

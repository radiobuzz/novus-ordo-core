<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\ReadModels\UserNationSetupStatusOwnerInfo;
use App\ReadModels\UserOwnerInfo;
use App\Services\LoggedInGameContext;
use App\Services\LoggedUserContext;
use App\Utils\Annotations\Summary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class UserController extends Controller
{
    #[Summary('Returns information about the current user.')]
    #[Response(UserOwnerInfo::class)]
    public function info(LoggedUserContext $context): JsonResponse {
        $user = $context->getUser();
        
        return response()->json($user->exportForOwner());
    }

    #[Summary('Used to check if the current already has a nation and if so, if they\'re done setting it up.')]
    #[Response(UserNationSetupStatusOwnerInfo::class)]
    public function nationSetupStatus(LoggedInGameContext $context): JsonResponse {
        $user = $context->getUser();
        
        return response()->json($user->exportNationSetupSatusForOwner($context->getGame()));
    }
    
    public function logoutCurrentUser(): Response {
        User::logoutCurrentUser();

        return redirect()->route('client.entry');
    }
}

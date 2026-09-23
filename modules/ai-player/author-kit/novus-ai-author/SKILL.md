---
name: novus-ai-author
description: Create or improve a single-file Novus Ordo AI player using this kit's observation, action contract and offline PHP runner. Use for bot strategy, memory, economy, military planning or optional model integration; not game-engine or administration changes.
---

# Novus AI author

Develop one PHP file that the game owner can install in the AI scripts folder. The bot may use rules, a model, or both. Do not assume an LLM is wanted.

Read [references/api.md](references/api.md) before editing a script. Use the actual fields in [snapshots/](snapshots/) rather than inventing endpoints, mechanics or intelligence. [scripts/my-first-bot.php](scripts/my-first-bot.php) is the smallest working template; [scripts/experimental-v1.php](scripts/experimental-v1.php) is the complete existing strategy.

## Workflow

- Clarify the desired behavior only where it changes the strategy. Keep the file identifier stable when updating an existing bot.
- Implement an object returned by the PHP file with `decide(view, memory, settings, tools)`. Define helpers inside its anonymous class so the file remains self-contained.
- Keep a private, bounded notebook in the returned memory. Handle empty/older memory and missing optional fields. A bot sees only its own notebook, not another script's.
- Use snapshot information and the documented tools. Return the shared action shape; the game applies actions and Ready. Never query a database, bootstrap Laravel or send game mutations directly.
- Check costs in the documented units, pending orders/deployments, human protection and map reachability. Explanations describe decisions, not claimed battle results.
- Run `php -l scripts/your-bot.php` and `php runtime/run.php scripts/your-bot.php snapshots/opening.json` with PHP 8.3+. Try the other snapshots and inspect the returned actions against the requested behavior. The runner validates structure, not full legality or victory.
- If PHP execution is unavailable, provide the file and exact check commands and state that it was not executed. Do not claim runtime verification based on reading alone.
- Deliver the single PHP file with a brief explanation of behavior and checks. The game owner installs/selects it and performs live playtesting; the author does not need the full game source.

## Optional model use

Only add provider calls when requested. Keep prompts, response parsing, summarization and helper tools within the script. Convert the provider's response into the shared game plan. Read credentials from an explicitly supplied environment variable, never embed them in scripts, notes, snapshots or explanations. Set network timeouts below the game's total script deadline. Avoid automatic paid retries. Throw on failure; the game owns the one-turn V1 fallback.

The bundled runner can execute network code in a script. A preview is free of game mutations, but may still call a paid service. Ordinary strategy development needs no API subscription.

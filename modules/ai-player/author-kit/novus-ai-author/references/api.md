# AI script contract, version 1

## File and entry point

A lowercase filename matching `[a-z0-9][a-z0-9-]{0,63}.php` is its stable script ID. Put `/** @ai-name Your display name */` near the top. Discovery reads that label without executing the file. The file returns an anonymous object:

```php
<?php
/** @ai-name Example player */
return new class {
    public function decide(array $view, array $memory, array $settings, callable $tools): array {
        $plan = $tools->emptyPlan('My decision explanation.');
        $plan['memory'] = $memory;
        return $plan;
    }
};
```

The game starts a fresh PHP process for each attempt. Put persistent strategy state in memory; do not rely on static variables or files. Use PHP 8.3+. No framework, database or autoloader is provided to the script. The game supplies the tools object. Standard PHP functions are available; optional external HTTP calls need explicit timeouts within the 20-second overall limit. The child process has a 256 MiB PHP memory limit. This is failure containment, not a security sandbox.

## Inputs

All observations are ordinary PHP arrays decoded from JSON. IDs are positive integers. Settings are `aggression` (0–100), `seed` (string) and `protect_humans` (boolean). A strategy can ignore aggression/seed; human protection is enforced by the game.

| View field | Meaning |
|---|---|
| api_version, game_id, nation_id, turn_number | Snapshot identity; current version is 1. |
| workspace | The same owner information exported to the player client. Contains nation, identity, leaders, budget, production_planning, turn_summary, deployment_limits, bids, divisions, deployments and definitions. |
| territories | Compact world: id, name, owner (null = neutral), terrain, water, sea, population (unknown neutral = null), loyalty (0–1), can_deploy, connections, land_connections. |
| divisions | Compact own active units: id, type, territory_id. For existing orders use workspace.divisions. |
| deployments | Compact queued own units: type, territory_id. For cancellation IDs use workspace.deployments. |
| budget | Same budget as workspace.budget. Monetary/resource numbers here are displayed units. |
| planning | Same raw production forecast inputs as workspace.production_planning. |
| pools | Territory ID → raw available labor-pool size. |
| production_raw | Resource name → raw production for forecasting non-labor resources. |
| definitions | Division type → game metadata: costs, powers, movement/capture capabilities. Same definitions as workspace.definitions.divisions, indexed by name. |
| opponents | Nation ID → approximate national army count and territory count. No exact opponent unit positions or current orders. |
| public_nations | Same public nation exports as the player interface, including approximate public statistics. |
| public_territories, own_territories | Same public/owner territory exports used by the client, including productivity and loyalty. |
| news | Current public news, using the same exporter as the web API. |
| battle_logs | Own participant battle logs from history_from_turn through this snapshot's turn, including text and battle IDs. |
| history_from_turn | Oldest included turn: at most 20 turns before the current turn. No on-demand live history endpoint exists in this kit. Summarize older events in memory. |
| conflict_events | Compact recent nation-versus-nation events involving this nation (12-turn window); neutral battles are in battle_logs. |
| recent_attacks | Territory IDs attacked while this nation defended within the last two turns. |
| human_ids | Nations currently under manual control. |

Use the bundled snapshots to inspect exact nested exporter shapes. `workspace.divisions` contains division_id, nation_id, territory_id, division_type and order (object or null). `workspace.deployments` contains deployment_id, division_type, nation_id and territory_id. Queued deployments are not movable active units until turn resolution.

## Helpers

- `$tools->emptyPlan($explanation)`: full empty action structure, empty memory. Copy your prior memory into it when preserving notes.
- `$tools->forecast($planning, $pools, $bids, $productionRaw)`: actual pure production allocator. Returns resource → production, balance, closing, all **raw units**. The tools object is also callable with these four arguments for V1 compatibility.
- `$tools->battleLogs($turnNumber = null)`: filter the included participant logs; null returns the included window. An empty list does not prove that older battles never occurred.

Helpers operate only on the snapshot and their arguments. No helper sends orders or exposes game objects. You may create strategic helpers in your script and call these primitives from them.

## Units and forecasting

One displayed resource unit equals 1,000,000 raw units. Budget stockpiles/production/balances and division metadata costs use displayed units. Production bid quantities, forecast planning values, pools, production_raw and forecast results use raw units. Convert explicitly; never compare a raw closing balance directly to a displayed unit cost.

Forecasts estimate production with the supplied inputs. They do not simulate combat, population changes or several actual turns. V1's multi-turn economy is a heuristic. Orders/deployments already present in the snapshot reserve resources. Do not budget them twice, or spend production that would only appear after adding new expenses.

## Return value

```json
{
  "bids": [],
  "cancel_orders": [],
  "cancel_deployments": [],
  "deployments": [],
  "orders": [],
  "disband": [],
  "memory": {},
  "explanation": "Preparing to expand into a nearby neutral territory."
}
```

- bids: empty means leave production bids unchanged. Otherwise provide exactly one bid for each of Food, Material, Ore and Oil. Each has resource_type, max_quantity (nonnegative raw integer), max_labor_allocation_per_unit (integer 0–2147483647). Zero quantity disables that resource's command bid. Capital is automatic; it is not a command bid.
- cancel_orders: own active **division IDs** whose existing orders should be cancelled.
- cancel_deployments: own current pending **deployment IDs**, not division IDs.
- deployments: `{"territory_id": 123, "division_type": "Infantry"}`. Infantry, Artillery, Armored, Fighter and Bomber are accepted; read current costs/limits/capabilities from definitions. At most 2000 entries.
- orders: `{"division_id": 456, "destination_territory_id": 789, "path_territory_ids": []}`. Empty path is valid for a direct reachable move. Up to 8 intermediate territory IDs; the game validates reachability for the unit type. Moving to hostile territory uses the normal attack rules and costs. At most 2000 entries.
- disband: own active division IDs. Disbanding follows normal turn timing; it does not instantly refund resources.
- memory: your JSON-serializable array/object, at most 64 KiB. Handle an empty notebook and your own version upgrades. Each nation/script has an independent notebook.
- explanation: nonempty text, at most 3000 UTF-8 bytes. Shown in administration.

Return every required field; cancel_orders/cancel_deployments are optional and default empty. Do not return invented action names. IDs must be integers, never numeric strings. A division can get at most one move/attack or disband action. Duplicate cancellation/disband IDs are rejected.

Application order: cancellations → production bids → deployments → movement/attacks → disband → Ready. Cancellations can precede a replacement order in the same plan. All actions and notes commit atomically. Ownership, affordability, deployment loyalty, reachability and human protection remain authoritative.

## Memory, failures and previews

The game updates only the notebook of the successfully applied script. A failed candidate's notes are discarded. Fallback uses V1's own notebook, leaves the chosen script assigned and is visible in the admin report. There is at most one fallback; if default V1 fails, the game pauses. A changed turn, script assignment or controller cancels stale work rather than invoking fallback.

Admin Preview runs decision code and structural checks but does not apply actions, save notes or Ready. It is **not full game-legality validation**. It may use fallback for execution/format errors and may make paid requests if the script contains them. The live step performs authoritative validation and may fall back for illegal actions.

Do not put API credentials, full prompts or private provider responses in your notes/explanation. LLM response formats are private to your script; parse and translate them to this contract. Errors should be concise and free of secrets.

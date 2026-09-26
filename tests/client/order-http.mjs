import { request } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? "", /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const fixture = JSON.parse(
    readFileSync(`${root}/order-http-fixture.json`, "utf8"),
);
const client_context = Object.fromEntries(
    [
        "game_id",
        "nation_id",
        "user_id",
        "turn_number",
        "turn_context_revision",
    ].map((key) => [key, fixture[key]]),
);
const options = {
    baseURL: "http://127.0.0.1:8792",
    extraHTTPHeaders: {
        Accept: "application/json",
        "X-Game-Id": String(fixture.game_id),
    },
};
const player = await request.newContext(options),
    guest = await request.newContext(options);
try {
    const guestSession = await (await guest.get("/client/session")).json();
    assert.equal(
        (
            await guest.post("/nation/divisions/move-orders", {
                headers: { "X-CSRF-TOKEN": guestSession.csrfToken },
                data: {},
            })
        ).status(),
        401,
    );
    const session = await (await player.get("/client/session")).json();
    assert.equal(
        (
            await player.post("/login-user", {
                headers: { "X-CSRF-TOKEN": session.csrfToken },
                data: {
                    username: fixture.username,
                    password: "fixture-password",
                },
            })
        ).status(),
        200,
    );
    const csrf = (await (await player.get("/client/session")).json()).csrfToken;
    const orders = fixture.unit_ids.map((division_id) => ({
        division_id,
        destination_territory_id: fixture.destination,
        path_territory_ids: [],
    }));
    const post = (body) =>
        player.post("/nation/divisions/move-orders", {
            headers: { "X-CSRF-TOKEN": csrf },
            data: body,
        });
    assert.equal(
        (
            await player.post("/nation/divisions/move-orders", {
                data: { client_context, orders },
            })
        ).status(),
        419,
    );
    for (const context of [
        { ...client_context, turn_number: fixture.turn_number + 1 },
        { ...client_context, user_id: fixture.user_id + 999 },
        { ...client_context, nation_id: fixture.nation_id + 999 },
        {
            ...client_context,
            turn_context_revision: "00000000-0000-4000-8000-000000000000",
        },
    ])
        assert.equal(
            (await post({ client_context: context, orders })).status(),
            409,
        );
    const start = performance.now();
    const accepted = await post({ client_context, orders });
    assert.equal(accepted.status(), 201, await accepted.text());
    assert.equal((await accepted.json()).data.length, 50);
    console.log(
        `50-unit HTTP command: ${Math.round(performance.now() - start)} ms`,
    );
    const before = (await (await player.get("/nation/divisions")).json()).data;
    for (const invalid of [
        [orders[0], orders[0]],
        [orders[0], { ...orders[1], division_id: fixture.foreign_unit_id }],
        [{ ...orders[0], path_territory_ids: [99999999] }],
        [{ ...orders[0], destination_territory_id: 99999999 }],
        [{ ...orders[0], division_id: "not-an-id" }],
    ])
        assert.equal(
            (await post({ client_context, orders: invalid })).status(),
            422,
        );
    assert.deepEqual(
        (await (await player.get("/nation/divisions")).json()).data,
        before,
    );
    for (const endpoint of [
        "/nation/divisions:cancel-orders",
        "/nation/divisions/disband-orders",
    ]) {
        const division_ids = [fixture.unit_ids[0], fixture.foreign_unit_id];
        const data = endpoint.endsWith("cancel-orders")
            ? { client_context, division_ids }
            : {
                  client_context,
                  orders: division_ids.map((division_id) => ({ division_id })),
              };
        assert.equal(
            (
                await player.post(endpoint, {
                    headers: { "X-CSRF-TOKEN": csrf },
                    data,
                })
            ).status(),
            422,
        );
    }
    assert.deepEqual(
        (await (await player.get("/nation/divisions")).json()).data,
        before,
    );
    const reversed = [...fixture.unit_ids].reverse();
    const disbanded = await player.post("/nation/divisions/disband-orders", {
        headers: { "X-CSRF-TOKEN": csrf },
        data: {
            client_context,
            orders: [...reversed, reversed[0]].map((division_id) => ({
                division_id,
            })),
        },
    });
    assert.equal(disbanded.status(), 201, await disbanded.text());
    assert.deepEqual(
        (await disbanded.json()).data.map((order) => order.division_id),
        [...reversed, reversed[0]],
    );
    const divisions = (await (await player.get("/nation/divisions")).json())
        .data;
    assert.ok(
        divisions
            .filter((unit) => fixture.unit_ids.includes(unit.division_id))
            .every((unit) => unit.order?.order_type === "Disband"),
    );
    const cancelled = await player.post("/nation/divisions:cancel-orders", {
        headers: { "X-CSRF-TOKEN": csrf },
        data: { client_context, division_ids: fixture.unit_ids },
    });
    assert.equal(cancelled.status(), 204);
    assert.ok(
        (await (await player.get("/nation/divisions")).json()).data
            .filter((unit) => fixture.unit_ids.includes(unit.division_id))
            .every((unit) => unit.order === null),
    );
    console.log(
        "PASS: authentication, CSRF, turn/revision/player fences, batch acceptance, atomic rejection, disband and cancellation.",
    );
} finally {
    await player.dispose();
    await guest.dispose();
}

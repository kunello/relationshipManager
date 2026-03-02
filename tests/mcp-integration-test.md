# MCP Server Integration Test Prompt

Paste this into a Claude.ai conversation with the CRM MCP server connected.

---

I need you to run a full integration test of the CRM MCP server. Follow each step in order, verify the expected result, and track pass/fail. Use the prefix [TEST-XX] for each step. All test data uses the surname "Testington" so it can be cleanly identified and deleted at the end.

IMPORTANT: Do NOT skip any steps. Do NOT ask for confirmation before each tool call — just execute them in sequence and report results.

## Phase 1: Contact CRUD

[TEST-01] Search for "Testington" to confirm no test data exists yet.
  Expected: 0 results.

[TEST-02] Add a contact: name="Alice Testington", company="TestCorp", role="Engineer", tags=["testing"], expertise=["QA"], notes=["Loves coffee"], howWeMet="Integration test".
  Expected: Contact created successfully with all fields populated.

[TEST-03] Add a contact: name="Bob Testington", company="TestCorp", role="Manager", tags=["testing"], expertise=["leadership"], howWeMet="Integration test".
  Expected: Contact created successfully.

[TEST-04] Search for "Testington".
  Expected: 2 results (Alice and Bob).

[TEST-05] Search with tag filter: tag="testing".
  Expected: Returns Alice and Bob (and possibly other real contacts with that tag).

[TEST-06] Search with company filter: company="TestCorp".
  Expected: Returns Alice and Bob.

[TEST-07] Search with expertise filter: expertise="QA".
  Expected: Returns Alice.

[TEST-08] Get full contact details for "Alice Testington".
  Expected: All fields present, 0 interactions.

[TEST-09] Update Alice: set role="Senior Engineer", add note "Promoted in 2026".
  Expected: Updated successfully, role changed, notes array has 2 entries.

## Phase 2: Interaction CRUD (single contact)

[TEST-10] Log interaction: contactName="Alice Testington", summary="Discussed testing strategy for Q1", date="2026-02-20", type="meeting", topics=["testing", "strategy"], location="Melbourne", mentionedNextSteps="Send test plan draft".
  Expected: Interaction created, linked to Alice.

[TEST-11] Log interaction: contactName="Bob Testington", summary="Quick sync on team hiring", date="2026-02-22", type="call", topics=["hiring"].
  Expected: Interaction created, linked to Bob.

[TEST-12] Get recent interactions filtered by contactName="Alice Testington".
  Expected: 1 interaction (the meeting).

[TEST-13] Get mentioned next steps.
  Expected: At least 1 result including "Send test plan draft".

[TEST-14] Edit Alice's interaction: change summary to "Discussed testing strategy for Q1 — agreed on Playwright", add topic "playwright".
  Expected: Interaction updated, updatedAt is set.

## Phase 3: Multi-contact interaction (race condition regression test)

[TEST-15] Log a GROUP interaction: contactNames=["Alice Testington", "Bob Testington"], summary="Team lunch to discuss roadmap", date="2026-02-25", type="meeting", topics=["roadmap", "team"], location="CBD cafe".
  Expected: Single interaction created with both contact IDs.

[TEST-16] Get contact details for Alice Testington.
  Expected: 2 interactions (the meeting + the group lunch). Summary should show both.

[TEST-17] Get contact details for Bob Testington.
  Expected: 2 interactions (the call + the group lunch). Summary should show both.

This is the critical test — if the race condition fix failed, one of Alice or Bob would be missing their updated summary after the group interaction.

## Phase 4: Duplicate detection

[TEST-18] Try to add contact: name="Alice Testington", company="OtherCorp".
  Expected: Warning about existing match, NOT created.

[TEST-19] Try to log interaction: contactName="Alice Testington", summary="Discussed testing strategy for Q1 — agreed on Playwright", date="2026-02-21".
  Expected: Duplicate detection warning (similar summary within +/-3 days).

## Phase 5: Delete contact with interaction preservation (deleteContact bug regression test)

[TEST-20] Delete contact "Alice Testington" WITHOUT setting deleteInteractions.
  Expected: Warning returned listing interaction counts (solo + group). Alice must NOT be deleted yet.

[TEST-21] Search for "Alice Testington" to confirm she still exists.
  Expected: 1 result — she was not deleted.

[TEST-22] Delete contact "Alice Testington" WITH deleteInteractions=true.
  Expected: Alice deleted. Her solo interaction deleted. Group lunch preserved but Alice removed from its contactIds.

[TEST-23] Get contact details for Bob Testington.
  Expected: Bob still has 2 interactions (his call + the group lunch). The group lunch should now only show Bob as participant.

## Phase 6: Cleanup

[TEST-24] Delete contact "Bob Testington" with deleteInteractions=true.
  Expected: Bob deleted, his solo interaction deleted, group lunch deleted (Bob was last remaining participant).

[TEST-25] Search for "Testington" to confirm all test data is gone.
  Expected: 0 results.

[TEST-26] Get recent interactions and verify no interactions reference any Testington contact IDs.
  Expected: No orphaned test interactions.

## Report

After all tests, print a summary table. For the ones that fail, include the raw JSON response in the description:

| Test | Description | Result |
|------|-------------|--------|
| TEST-01 | ... | PASS/FAIL |
| ... | ... | ... |

If any test FAILED, describe what went wrong.

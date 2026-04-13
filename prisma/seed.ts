/**
 * Seed script — creates test data for local development.
 *
 * Usage: npx tsx prisma/seed.ts
 *
 * Creates:
 * - 4 test users (Todd as commissioner/admin, 3 participants)
 * - 1 NBA series (OKC vs Memphis)
 * - 2 NBA games in the series
 * - ~20 NBA players per team
 * - 1 league linked to the series
 * - 4 participants in the league
 * - Draft slots, picks, and box scores for Game 1 (final)
 * - Draft slots and picks for Game 2 (active, with live stats)
 */

import { PrismaClient } from "../generated/prisma/index.js";

const db = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ── Users ──────────────────────────────────────────────────────
  const todd = await db.user.upsert({
    where: { email: "todd@test.com" },
    update: {},
    create: { email: "todd@test.com", name: "Todd", role: "admin" },
  });

  const alice = await db.user.upsert({
    where: { email: "alice@test.com" },
    update: {},
    create: { email: "alice@test.com", name: "Alice", role: "participant" },
  });

  const bob = await db.user.upsert({
    where: { email: "bob@test.com" },
    update: {},
    create: { email: "bob@test.com", name: "Bob", role: "participant" },
  });

  const charlie = await db.user.upsert({
    where: { email: "charlie@test.com" },
    update: {},
    create: { email: "charlie@test.com", name: "Charlie", role: "participant" },
  });

  console.log("Users created");

  // ── NBA Series ────────────────────────────────────────────────
  const series = await db.nbaSeries.upsert({
    where: { seriesId: "2025-wc1-okc-memphis" },
    update: {},
    create: {
      seriesId: "2025-wc1-okc-memphis",
      homeTeamId: 1610612760,
      awayTeamId: 1610612763,
      homeTeamName: "Oklahoma City Thunder",
      awayTeamName: "Memphis Grizzlies",
      homeTricode: "OKC",
      awayTricode: "MEM",
      seasonYear: "2025",
      round: 1,
      status: "active",
    },
  });

  console.log("NBA Series created");

  // ── NBA Games ─────────────────────────────────────────────────
  const nbaGame1 = await db.nbaGame.upsert({
    where: { nbaGameId: "0042500101" },
    update: {},
    create: {
      nbaGameId: "0042500101",
      seriesDbId: series.id,
      gameDate: new Date("2025-04-20T19:00:00Z"),
      status: "final",
      period: 4,
      homeTeamScore: 112,
      awayTeamScore: 104,
    },
  });

  const nbaGame2 = await db.nbaGame.upsert({
    where: { nbaGameId: "0042500102" },
    update: {},
    create: {
      nbaGameId: "0042500102",
      seriesDbId: series.id,
      gameDate: new Date("2025-04-22T19:00:00Z"),
      status: "in-progress",
      period: 3,
      homeTeamScore: 78,
      awayTeamScore: 82,
    },
  });

  console.log("NBA Games created");

  // ── NBA Players ───────────────────────────────────────────────
  const okcPlayers = [
    { nbaPlayerId: 1630162, firstName: "Shai", familyName: "Gilgeous-Alexander", position: "G", jersey: "2" },
    { nbaPlayerId: 1630532, firstName: "Jalen", familyName: "Williams", position: "F", jersey: "8" },
    { nbaPlayerId: 1628991, firstName: "Chet", familyName: "Holmgren", position: "C", jersey: "7" },
    { nbaPlayerId: 1630567, firstName: "Lu", familyName: "Dort", position: "G", jersey: "5" },
    { nbaPlayerId: 1629675, firstName: "Isaiah", familyName: "Joe", position: "G", jersey: "11" },
    { nbaPlayerId: 203460,  firstName: "Alex", familyName: "Caruso", position: "G", jersey: "6" },
    { nbaPlayerId: 1630536, firstName: "Aaron", familyName: "Wiggins", position: "F", jersey: "21" },
    { nbaPlayerId: 1631105, firstName: "Cason", familyName: "Wallace", position: "G", jersey: "22" },
    { nbaPlayerId: 1629006, firstName: "Isaiah", familyName: "Hartenstein", position: "C", jersey: "55" },
    { nbaPlayerId: 1631218, firstName: "Jaylin", familyName: "Williams", position: "F", jersey: "6" },
  ];

  const memPlayers = [
    { nbaPlayerId: 1629630, firstName: "Ja", familyName: "Morant", position: "G", jersey: "12" },
    { nbaPlayerId: 1629627, firstName: "Jaren", familyName: "Jackson Jr.", position: "F", jersey: "13" },
    { nbaPlayerId: 1628370, firstName: "Desmond", familyName: "Bane", position: "G", jersey: "22" },
    { nbaPlayerId: 203516,  firstName: "Marcus", familyName: "Smart", position: "G", jersey: "36" },
    { nbaPlayerId: 1629741, firstName: "Santi", familyName: "Aldama", position: "F", jersey: "7" },
    { nbaPlayerId: 1631170, firstName: "GG", familyName: "Jackson", position: "G", jersey: "24" },
    { nbaPlayerId: 1629633, firstName: "Brandon", familyName: "Clarke", position: "F", jersey: "15" },
    { nbaPlayerId: 1630285, firstName: "Scotty", familyName: "Pippen Jr.", position: "G", jersey: "1" },
    { nbaPlayerId: 1631167, firstName: "Vince", familyName: "Williams Jr.", position: "G", jersey: "5" },
    { nbaPlayerId: 1628394, firstName: "Luke", familyName: "Kennard", position: "G", jersey: "10" },
  ];

  for (const p of [...okcPlayers, ...memPlayers]) {
    await db.nbaPlayer.upsert({
      where: { nbaPlayerId: p.nbaPlayerId },
      update: {},
      create: {
        nbaPlayerId: p.nbaPlayerId,
        firstName: p.firstName,
        familyName: p.familyName,
        teamId: okcPlayers.includes(p) ? 1610612760 : 1610612763,
        teamTricode: okcPlayers.includes(p) ? "OKC" : "MEM",
        position: p.position,
        jersey: p.jersey,
      },
    });
  }

  console.log("NBA Players created");

  // ── League ────────────────────────────────────────────────────
  const league = await db.league.upsert({
    where: { id: "seed-league-1" },
    update: {},
    create: {
      id: "seed-league-1",
      name: "Thunder vs Grizzlies Pool",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 60,
      createdById: todd.id,
      inviteToken: "test-invite-abc123",
    },
  });

  console.log("League created");

  // ── Participants ──────────────────────────────────────────────
  const participants = [];
  for (const [user, isComm] of [
    [todd, true],
    [alice, false],
    [bob, false],
    [charlie, false],
  ] as const) {
    const p = await db.participant.upsert({
      where: { userId_leagueId: { userId: user.id, leagueId: league.id } },
      update: {},
      create: {
        userId: user.id,
        leagueId: league.id,
        isCommissioner: isComm,
      },
    });
    participants.push(p);
  }

  const [pTodd, pAlice, pBob, pCharlie] = participants;

  console.log("Participants created");

  // ── Game 1 (Final) ────────────────────────────────────────────
  const game1 = await db.game.upsert({
    where: { leagueId_nbaGameId: { leagueId: league.id, nbaGameId: "0042500101" } },
    update: {},
    create: {
      leagueId: league.id,
      nbaGameId: "0042500101",
      gameNumber: 1,
      status: "final",
    },
  });

  // Draft slots for game 1
  const game1Slots = [
    { participantId: pTodd!.id, pickPosition: 1 },
    { participantId: pAlice!.id, pickPosition: 2 },
    { participantId: pBob!.id, pickPosition: 3 },
    { participantId: pCharlie!.id, pickPosition: 4 },
  ];

  const slotIds1: string[] = [];
  for (const s of game1Slots) {
    const slot = await db.draftSlot.upsert({
      where: {
        gameId_participantId: { gameId: game1.id, participantId: s.participantId },
      },
      update: {},
      create: {
        gameId: game1.id,
        participantId: s.participantId,
        pickPosition: s.pickPosition,
      },
    });
    slotIds1.push(slot.id);
  }

  // Picks for game 1
  const game1Picks = [
    { slotId: slotIds1[0]!, participantId: pTodd!.id, nbaPlayerId: 1630162 },    // SGA
    { slotId: slotIds1[1]!, participantId: pAlice!.id, nbaPlayerId: 1629630 },   // Ja
    { slotId: slotIds1[2]!, participantId: pBob!.id, nbaPlayerId: 1630532 },     // Jalen Williams
    { slotId: slotIds1[3]!, participantId: pCharlie!.id, nbaPlayerId: 1629627 }, // JJJ
  ];

  for (const pick of game1Picks) {
    await db.pick.upsert({
      where: {
        leagueId_gameId_nbaPlayerId: {
          leagueId: league.id,
          gameId: game1.id,
          nbaPlayerId: pick.nbaPlayerId,
        },
      },
      update: {},
      create: {
        draftSlotId: pick.slotId,
        nbaPlayerId: pick.nbaPlayerId,
        participantId: pick.participantId,
        gameId: game1.id,
        leagueId: league.id,
        method: "manual",
        confirmed: true,
      },
    });
  }

  // Box scores for game 1 (final stats)
  const game1Stats = [
    { nbaPlayerId: 1630162, minutes: 38, points: 34, rebounds: 5, assists: 8, steals: 2, blocks: 1 },  // SGA
    { nbaPlayerId: 1629630, minutes: 35, points: 28, rebounds: 4, assists: 10, steals: 1, blocks: 0 }, // Ja
    { nbaPlayerId: 1630532, minutes: 36, points: 22, rebounds: 7, assists: 4, steals: 1, blocks: 2 },  // Jalen
    { nbaPlayerId: 1629627, minutes: 34, points: 20, rebounds: 9, assists: 2, steals: 0, blocks: 4 },  // JJJ
    // Other players with stats
    { nbaPlayerId: 1628991, minutes: 32, points: 18, rebounds: 10, assists: 3, steals: 1, blocks: 3 },
    { nbaPlayerId: 1630567, minutes: 30, points: 12, rebounds: 3, assists: 2, steals: 3, blocks: 0 },
    { nbaPlayerId: 1628370, minutes: 33, points: 16, rebounds: 4, assists: 5, steals: 2, blocks: 0 },
    { nbaPlayerId: 203516,  minutes: 28, points: 10, rebounds: 3, assists: 6, steals: 3, blocks: 1 },
  ];

  for (const s of game1Stats) {
    const fp = 1 * s.points + 2 * s.rebounds + 2 * s.assists + 3 * s.steals + 3 * s.blocks;
    await db.boxScore.upsert({
      where: {
        nbaGameId_nbaPlayerId: { nbaGameId: "0042500101", nbaPlayerId: s.nbaPlayerId },
      },
      update: {},
      create: {
        nbaGameId: "0042500101",
        nbaPlayerId: s.nbaPlayerId,
        minutes: s.minutes,
        points: s.points,
        rebounds: s.rebounds,
        assists: s.assists,
        steals: s.steals,
        blocks: s.blocks,
        fantasyPoints: fp,
        period: 4,
        isFinal: true,
      },
    });
  }

  console.log("Game 1 (final) seeded with picks and box scores");

  // ── Game 2 (Active — in Q3) ──────────────────────────────────
  const game2 = await db.game.upsert({
    where: { leagueId_nbaGameId: { leagueId: league.id, nbaGameId: "0042500102" } },
    update: {},
    create: {
      leagueId: league.id,
      nbaGameId: "0042500102",
      gameNumber: 2,
      status: "active",
    },
  });

  // Draft slots for game 2 (inverse of game 1 standings — worst score picks first)
  const game2Slots = [
    { participantId: pCharlie!.id, pickPosition: 1 },
    { participantId: pBob!.id, pickPosition: 2 },
    { participantId: pAlice!.id, pickPosition: 3 },
    { participantId: pTodd!.id, pickPosition: 4 },
  ];

  const slotIds2: string[] = [];
  for (const s of game2Slots) {
    const slot = await db.draftSlot.upsert({
      where: {
        gameId_participantId: { gameId: game2.id, participantId: s.participantId },
      },
      update: {},
      create: {
        gameId: game2.id,
        participantId: s.participantId,
        pickPosition: s.pickPosition,
      },
    });
    slotIds2.push(slot.id);
  }

  // Picks for game 2 (different players — can't reuse burned players)
  const game2Picks = [
    { slotId: slotIds2[0]!, participantId: pCharlie!.id, nbaPlayerId: 1628370 }, // Bane
    { slotId: slotIds2[1]!, participantId: pBob!.id, nbaPlayerId: 1628991 },     // Chet
    { slotId: slotIds2[2]!, participantId: pAlice!.id, nbaPlayerId: 1630567 },   // Dort
    { slotId: slotIds2[3]!, participantId: pTodd!.id, nbaPlayerId: 203516 },     // Smart
  ];

  for (const pick of game2Picks) {
    await db.pick.upsert({
      where: {
        leagueId_gameId_nbaPlayerId: {
          leagueId: league.id,
          gameId: game2.id,
          nbaPlayerId: pick.nbaPlayerId,
        },
      },
      update: {},
      create: {
        draftSlotId: pick.slotId,
        nbaPlayerId: pick.nbaPlayerId,
        participantId: pick.participantId,
        gameId: game2.id,
        leagueId: league.id,
        method: "manual",
        confirmed: true,
      },
    });
  }

  // Box scores for game 2 (in-progress Q3 stats)
  const game2Stats = [
    { nbaPlayerId: 1628370, minutes: 24, points: 18, rebounds: 3, assists: 4, steals: 1, blocks: 0 },  // Bane
    { nbaPlayerId: 1628991, minutes: 25, points: 16, rebounds: 8, assists: 2, steals: 0, blocks: 4 },  // Chet
    { nbaPlayerId: 1630567, minutes: 22, points: 10, rebounds: 2, assists: 1, steals: 2, blocks: 1 },  // Dort
    { nbaPlayerId: 203516,  minutes: 23, points: 8, rebounds: 4, assists: 7, steals: 2, blocks: 0 },   // Smart
    // Other players
    { nbaPlayerId: 1630162, minutes: 26, points: 22, rebounds: 3, assists: 6, steals: 1, blocks: 0 },
    { nbaPlayerId: 1629630, minutes: 24, points: 20, rebounds: 2, assists: 8, steals: 2, blocks: 0 },
    { nbaPlayerId: 1630532, minutes: 25, points: 14, rebounds: 5, assists: 3, steals: 0, blocks: 1 },
    { nbaPlayerId: 1629627, minutes: 23, points: 12, rebounds: 7, assists: 1, steals: 1, blocks: 3 },
  ];

  for (const s of game2Stats) {
    const fp = 1 * s.points + 2 * s.rebounds + 2 * s.assists + 3 * s.steals + 3 * s.blocks;
    await db.boxScore.upsert({
      where: {
        nbaGameId_nbaPlayerId: { nbaGameId: "0042500102", nbaPlayerId: s.nbaPlayerId },
      },
      update: {},
      create: {
        nbaGameId: "0042500102",
        nbaPlayerId: s.nbaPlayerId,
        minutes: s.minutes,
        points: s.points,
        rebounds: s.rebounds,
        assists: s.assists,
        steals: s.steals,
        blocks: s.blocks,
        fantasyPoints: fp,
        period: 3,
        isFinal: false,
      },
    });
  }

  console.log("Game 2 (active Q3) seeded with picks and box scores");
  console.log("\n=== Seed complete ===");
  console.log("Sign in with: todd@test.com (commissioner/admin)");
  console.log("Other users: alice@test.com, bob@test.com, charlie@test.com");
  console.log("League: Thunder vs Grizzlies Pool");
  console.log("Game 1: Final (SGA 63fp, Ja 56fp, Jalen 49fp, JJJ 50fp)");
  console.log("Game 2: Active Q3 (Bane, Chet, Dort, Smart — live stats)");
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });

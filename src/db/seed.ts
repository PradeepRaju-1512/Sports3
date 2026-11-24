import "dotenv/config";
import { count } from "drizzle-orm";
import { db, pool } from "./index.js";
import {
  users,
  notices,
  sportsClubs,
  clubMemberships,
  clubActivities,
  notifications,
  tournaments,
  tournamentTeams,
  teamRosterMembers,
  tournamentMatches,
} from "./schema.js";

const NINE_CLUBS = [
  {
    slug: "football",
    name: "Football",
    groupType: "OUTDOOR_TEAM",
    description:
      "Inter-batch league, Prothymos squads, and evening ground drills.",
    venue: "Main Football Ground",
    inductionOpen: true,
    sortOrder: 1,
  },
  {
    slug: "cricket",
    name: "Cricket",
    groupType: "OUTDOOR_TEAM",
    description:
      "Hard-ball and turf nets, semester championships, and auction pool.",
    venue: "IIITT Cricket Ground",
    inductionOpen: true,
    sortOrder: 2,
  },
  {
    slug: "volleyball",
    name: "Volleyball",
    groupType: "OUTDOOR_TEAM",
    description:
      "High-intensity court sessions, rotation drills, and fest brackets.",
    venue: "Outdoor Volleyball Courts",
    inductionOpen: true,
    sortOrder: 3,
  },
  {
    slug: "kho-kho",
    name: "Kho Kho",
    groupType: "OUTDOOR_TEAM",
    description:
      "Agility relays, chasers/runners formations, and tournament prep.",
    venue: "Campus Track & Field",
    inductionOpen: true,
    sortOrder: 4,
  },
  {
    slug: "kabaddi",
    name: "Kabaddi",
    groupType: "OUTDOOR_TEAM",
    description: "Raid conditioning, defensive holds, and mat/ground scrimmages.",
    venue: "Kabaddi Arena",
    inductionOpen: true,
    sortOrder: 5,
  },
  {
    slug: "badminton",
    name: "Badminton",
    groupType: "INDOOR_GAME",
    description:
      "Singles & doubles footwork, rally ladders, and indoor court play.",
    venue: "Indoor Badminton Hall",
    inductionOpen: true,
    sortOrder: 6,
  },
  {
    slug: "table-tennis",
    name: "Table Tennis",
    groupType: "INDOOR_GAME",
    description:
      "Spin control, matchplay rotations, and hostel/batch challenges.",
    venue: "Student Activity Center TT Tables",
    inductionOpen: true,
    sortOrder: 7,
  },
  {
    slug: "carrom",
    name: "Carrom",
    groupType: "INDOOR_GAME",
    description: "Precision breaks, doubles boards, and semester indoor fixtures.",
    venue: "Indoor Recreation Room",
    inductionOpen: true,
    sortOrder: 8,
  },
  {
    slug: "chess",
    name: "Chess",
    groupType: "INDOOR_GAME",
    description:
      "Rapid & blitz arenas, opening prep, and inter-batch tournaments.",
    venue: "Seminar & Chess Lounge",
    inductionOpen: true,
    sortOrder: 9,
  },
];

async function seed() {
  if (!db || !pool) {
    throw new Error("DATABASE_URL must be set in .env to run db:seed");
  }

  const sampleUsers = [
    {
      name: "Karthik Nair",
      email: "karthik.22@iiitt.ac.in",
      rollNumber: "CS22B1012",
      batch: "4TH",
      branch: "CSE",
      role: "SPORTS_SECRETARY",
    },
    {
      name: "Dr. R. Sundaram",
      email: "sundaram@iiitt.ac.in",
      rollNumber: "FAC004",
      batch: "STAFF",
      branch: "PED",
      role: "FACULTY_ADVISOR",
    },
    {
      name: "Aditi Menon",
      email: "aditi.23@iiitt.ac.in",
      rollNumber: "EC23B1024",
      batch: "3RD",
      branch: "ECE",
      role: "CLUB_SECRETARY",
    },
    {
      name: "Rohan Verma",
      email: "rohan.24@iiitt.ac.in",
      rollNumber: "CS24B1041",
      batch: "2ND",
      branch: "CSE",
      role: "CLUB_COORDINATOR",
    },
    {
      name: "Arjun Das",
      email: "arjun.23@iiitt.ac.in",
      rollNumber: "CS23B1019",
      batch: "3RD",
      branch: "CSE",
      role: "MATCH_SCORER",
    },
    {
      name: "Vikram Rao",
      email: "vikram.22@iiitt.ac.in",
      rollNumber: "EC22B1008",
      batch: "4TH",
      branch: "ECE",
      role: "AUCTION_OPERATOR",
    },
    {
      name: "Meera Krishnan",
      email: "meera.25@iiitt.ac.in",
      rollNumber: "ME25B1018",
      batch: "1ST",
      branch: "MECH",
      role: "CLUB_MEMBER",
    },
    {
      name: "Siddharth Iyer",
      email: "siddharth.m25@iiitt.ac.in",
      rollNumber: "CS25M1005",
      batch: "MTECH",
      branch: "CSE",
      role: "CLUB_MEMBER",
    },
    {
      name: "Ananya Reddy",
      email: "ananya.25@iiitt.ac.in",
      rollNumber: "EC25B1033",
      batch: "1ST",
      branch: "ECE",
      role: "STUDENT",
    },
  ];

  for (const u of sampleUsers) {
    await db
      .insert(users)
      .values(u)
      .onConflictDoNothing({ target: users.email });
  }

  for (const club of NINE_CLUBS) {
    await db
      .insert(sportsClubs)
      .values(club)
      .onConflictDoNothing({ target: sportsClubs.slug });
  }

  const [{ value: existingNotices }] = await db
    .select({ value: count() })
    .from(notices);

  if (existingNotices === 0) {
    await db.insert(notices).values([
      {
        title: "Semester Sports Trials & Club Inductions Open",
        summary:
          "All 9 clubs are scheduling batch-wise practice and induction sessions this week.",
        category: "TRIAL",
        isUrgentBanner: true,
      },
      {
        title: "Prothymos Registration Window Announced",
        summary:
          "Students can enroll across multiple sports and positions with CLUB vs. NON_CLUB base prices.",
        category: "TOURNAMENT",
        isUrgentBanner: false,
      },
      {
        title: "Evening Ground & Hall Timings Updated",
        summary:
          "Outdoor team drills start at 5:00 PM; indoor hall sessions run in structured slots.",
        category: "GENERAL",
        isUrgentBanner: false,
      },
    ]);
  }

  const allClubs = await db.select().from(sportsClubs);
  const allUsers = await db.select().from(users);

  const secUser = allUsers.find((u) => u.email === "aditi.23@iiitt.ac.in");
  const coord2nd = allUsers.find((u) => u.email === "rohan.24@iiitt.ac.in");
  const scorerUser = allUsers.find((u) => u.email === "arjun.23@iiitt.ac.in");
  const member1st = allUsers.find((u) => u.email === "meera.25@iiitt.ac.in");
  const memberMtech = allUsers.find(
    (u) => u.email === "siddharth.m25@iiitt.ac.in"
  );
  const applicant1st = allUsers.find((u) => u.email === "ananya.25@iiitt.ac.in");

  const [{ value: existingMemberships }] = await db
    .select({ value: count() })
    .from(clubMemberships);

  if (
    existingMemberships === 0 &&
    secUser &&
    coord2nd &&
    member1st &&
    memberMtech &&
    applicant1st
  ) {
    for (const club of allClubs) {
      await db.insert(clubMemberships).values([
        {
          clubId: club.id,
          userId: secUser.id,
          memberRole: "SECRETARY",
          batchScope: "ALL",
          status: "INDUCTED",
        },
        {
          clubId: club.id,
          userId: coord2nd.id,
          memberRole: "COORDINATOR",
          batchScope: "2ND",
          status: "INDUCTED",
        },
        {
          clubId: club.id,
          userId: member1st.id,
          memberRole: "MEMBER",
          batchScope: "1ST",
          status: "INDUCTED",
        },
        {
          clubId: club.id,
          userId: memberMtech.id,
          memberRole: "MEMBER",
          batchScope: "MTECH",
          status: "INDUCTED",
        },
        {
          clubId: club.id,
          userId: applicant1st.id,
          memberRole: "MEMBER",
          batchScope: "1ST",
          status: "APPLIED",
        },
      ]);
    }
  }

  const [{ value: existingActivities }] = await db
    .select({ value: count() })
    .from(clubActivities);

  if (existingActivities === 0 && secUser) {
    for (const club of allClubs) {
      await db.insert(clubActivities).values([
        {
          clubId: club.id,
          activityType: "Practice",
          targetBatch: "4th Year",
          categoryGender: "Boys",
          scheduledLabel: "Today, 5:00 PM",
          venue: club.venue,
          createdByUserId: secUser.id,
        },
        {
          clubId: club.id,
          activityType: "Induction",
          targetBatch: "All Batches",
          categoryGender: "Open",
          scheduledLabel: "Tomorrow, 4:30 PM",
          venue: club.venue,
          createdByUserId: secUser.id,
        },
      ]);
    }
  }

  const [{ value: existingNotifs }] = await db
    .select({ value: count() })
    .from(notifications);

  const firstClub = allClubs[0];
  if (existingNotifs === 0 && member1st && firstClub) {
    await db.insert(notifications).values({
      userId: member1st.id,
      clubId: firstClub.id,
      message: `${firstClub.name}: Practice · 4th Year · Boys · Today, 5:00 PM at ${firstClub.venue}`,
      isRead: false,
    });
  }

  const [{ value: existingTournaments }] = await db
    .select({ value: count() })
    .from(tournaments);

  if (existingTournaments === 0) {
    const [currentTourney] = await db
      .insert(tournaments)
      .values({
        name: "Odd Semester Championship 2026",
        year: 2026,
        semester: "ODD",
        tournamentType: "INTER_BATCH",
        competitionFormat: "LEAGUE_KNOCKOUT",
        dateRange: "Nov 20 – Dec 05, 2026",
        structureNotes:
          "Evening matches 5:00 PM – 8:30 PM; indoor courts from 4:00 PM.",
        sportsIncluded:
          "Cricket,Football,Volleyball,Badminton,Table Tennis,Chess",
        status: "CURRENT",
      })
      .returning();

    const [upcomingTourney, t2025, t2024] = await db
      .insert(tournaments)
      .values([
        {
          name: "Prothymos 2027 (Even Sem Meet)",
          year: 2027,
          semester: "EVEN",
          tournamentType: "PROTHYMOS",
          competitionFormat: "LEAGUE_KNOCKOUT",
          dateRange: "Feb 14 – Feb 23, 2027",
          structureNotes:
            "Player auction prior to fixtures; morning & evening knockout stages.",
          sportsIncluded:
            "Cricket,Football,Volleyball,Kho Kho,Kabaddi,Badminton,Table Tennis,Carrom,Chess",
          status: "UPCOMING",
        },
        {
          name: "Prothymos Championship 2025",
          year: 2025,
          semester: "EVEN",
          tournamentType: "PROTHYMOS",
          competitionFormat: "LEAGUE_KNOCKOUT",
          dateRange: "Feb 10 – Feb 19, 2025",
          structureNotes: "Archived 2025 Prothymos edition.",
          sportsIncluded: "Cricket,Football,Badminton",
          status: "ARCHIVED",
        },
        {
          name: "Autumn Sports Meet 2024",
          year: 2024,
          semester: "ODD",
          tournamentType: "INTER_BATCH",
          competitionFormat: "KNOCKOUT",
          dateRange: "Oct 12 – Oct 20, 2024",
          structureNotes: "Archived 2024 Autumn Sports Meet.",
          sportsIncluded: "Football,Cricket,Volleyball",
          status: "ARCHIVED",
        },
      ])
      .returning();

    void upcomingTourney;

    if (currentTourney) {
      await db.insert(tournamentTeams).values([
        {
          tournamentId: currentTourney.id,
          sportName: "Cricket",
          teamName: "Trichy Titans",
          placement: "NONE",
          played: 2,
          won: 2,
          lost: 0,
          drawn: 0,
          points: 4,
          nrrOrDiff: "+1.85",
        },
        {
          tournamentId: currentTourney.id,
          sportName: "Cricket",
          teamName: "Cauvery Kings",
          placement: "NONE",
          played: 2,
          won: 1,
          lost: 1,
          drawn: 0,
          points: 2,
          nrrOrDiff: "+0.42",
        },
        {
          tournamentId: currentTourney.id,
          sportName: "Cricket",
          teamName: "Delta Dynamos",
          placement: "NONE",
          played: 2,
          won: 0,
          lost: 2,
          drawn: 0,
          points: 0,
          nrrOrDiff: "-2.27",
        },
        {
          tournamentId: currentTourney.id,
          sportName: "Football",
          teamName: "Kaveri United",
          placement: "NONE",
          played: 1,
          won: 1,
          lost: 0,
          drawn: 0,
          points: 3,
          nrrOrDiff: "+2",
        },
        {
          tournamentId: currentTourney.id,
          sportName: "Football",
          teamName: "Chola Rovers",
          placement: "NONE",
          played: 1,
          won: 0,
          lost: 1,
          drawn: 0,
          points: 0,
          nrrOrDiff: "-2",
        },
      ]);

      await db.insert(tournamentMatches).values([
        {
          tournamentId: currentTourney.id,
          sportName: "Cricket",
          stage: "Group Match",
          matchOrder: 3,
          teamA: "Trichy Titans",
          teamB: "Cauvery Kings",
          scoreA: "94/3 (11.2 ov)",
          scoreB: "Yet to bat",
          status: "LIVE",
          scheduledTime: "Today · Live Now",
          venue: "IIITT Cricket Ground",
          resultSummary: "In Progress — Powerplay & middle overs underway",
          detailedBreakdown:
            "Top Performers: R. Verma 41*(26), K. Nair 2/18.\nVenue: IIITT Cricket Ground.",
          scorerUserId: scorerUser?.id || null,
        },
        {
          tournamentId: currentTourney.id,
          sportName: "Cricket",
          stage: "Semi-Final",
          matchOrder: 4,
          teamA: "Trichy Titans",
          teamB: "Delta Dynamos",
          scoreA: "0",
          scoreB: "0",
          status: "UPCOMING",
          scheduledTime: "Tomorrow, 5:00 PM",
          venue: "IIITT Cricket Ground",
          resultSummary: "Scheduled",
          detailedBreakdown: "15-over floodlight semi-final fixture.",
          scorerUserId: scorerUser?.id || null,
        },
        {
          tournamentId: currentTourney.id,
          sportName: "Cricket",
          stage: "Group Match",
          matchOrder: 1,
          teamA: "Trichy Titans",
          teamB: "Delta Dynamos",
          scoreA: "148/5 (15 ov)",
          scoreB: "112/8 (15 ov)",
          status: "COMPLETED",
          scheduledTime: "22 Nov 2026",
          venue: "IIITT Cricket Ground",
          resultSummary: "Trichy Titans won by 36 runs",
          detailedBreakdown:
            "Top Performers: R. Verma 58(34), A. Menon 3/14.\nOpening fixture completed.",
          scorerUserId: scorerUser?.id || null,
        },
        {
          tournamentId: currentTourney.id,
          sportName: "Football",
          stage: "Group Match",
          matchOrder: 2,
          teamA: "Kaveri United",
          teamB: "Chola Rovers",
          scoreA: "3",
          scoreB: "1",
          status: "COMPLETED",
          scheduledTime: "21 Nov 2026",
          venue: "Main Football Ground",
          resultSummary: "Kaveri United won by 2 goals",
          detailedBreakdown:
            "Top Performers: S. Iyer (2 Goals, 1 Assist).\nFull-time 70 mins.",
          scorerUserId: scorerUser?.id || null,
        },
      ]);
    }

    if (t2025) {
      const [win25, ru1_25, ru2_25] = await db
        .insert(tournamentTeams)
        .values([
          {
            tournamentId: t2025.id,
            sportName: "Cricket",
            teamName: "Trichy Titans",
            placement: "WINNER",
            played: 4,
            won: 4,
            lost: 0,
            drawn: 0,
            points: 8,
            nrrOrDiff: "+2.10",
          },
          {
            tournamentId: t2025.id,
            sportName: "Cricket",
            teamName: "Cauvery Kings",
            placement: "RUNNER_UP_1",
            played: 4,
            won: 2,
            lost: 2,
            drawn: 0,
            points: 4,
            nrrOrDiff: "+0.35",
          },
          {
            tournamentId: t2025.id,
            sportName: "Cricket",
            teamName: "Pallava Strikers",
            placement: "RUNNER_UP_2",
            played: 4,
            won: 1,
            lost: 3,
            drawn: 0,
            points: 2,
            nrrOrDiff: "-0.80",
          },
        ])
        .returning();

      if (win25 && ru1_25 && ru2_25) {
        await db.insert(teamRosterMembers).values([
          {
            teamId: win25.id,
            playerName: "Karthik Nair",
            playerRole: "Captain / All-Rounder",
            batchYear: "3RD",
            branch: "CSE",
          },
          {
            teamId: win25.id,
            playerName: "Aditi Menon",
            playerRole: "Top-Order Batter",
            batchYear: "2ND",
            branch: "ECE",
          },
          {
            teamId: ru1_25.id,
            playerName: "Rohan Verma",
            playerRole: "Captain / Pace Bowler",
            batchYear: "1ST",
            branch: "CSE",
          },
          {
            teamId: ru2_25.id,
            playerName: "Siddharth Iyer",
            playerRole: "Wicketkeeper / Batter",
            batchYear: "MTECH",
            branch: "CSE",
          },
        ]);
      }

      await db.insert(tournamentMatches).values([
        {
          tournamentId: t2025.id,
          sportName: "Cricket",
          stage: "Final",
          matchOrder: 30,
          teamA: "Trichy Titans",
          teamB: "Cauvery Kings",
          scoreA: "162/4",
          scoreB: "145/9",
          status: "COMPLETED",
          scheduledTime: "19 Feb 2025",
          venue: "IIITT Cricket Ground",
          resultSummary: "Trichy Titans won the Final by 17 runs",
          detailedBreakdown: "Player of the Match: Karthik Nair (64* & 2/21).",
          scorerUserId: scorerUser?.id || null,
        },
        {
          tournamentId: t2025.id,
          sportName: "Cricket",
          stage: "Semi-Final",
          matchOrder: 20,
          teamA: "Cauvery Kings",
          teamB: "Pallava Strikers",
          scoreA: "139/6",
          scoreB: "131/10",
          status: "COMPLETED",
          scheduledTime: "17 Feb 2025",
          venue: "IIITT Cricket Ground",
          resultSummary: "Cauvery Kings won Semi-Final by 8 runs",
          detailedBreakdown: "Player of the Match: Rohan Verma (3/19).",
          scorerUserId: scorerUser?.id || null,
        },
        {
          tournamentId: t2025.id,
          sportName: "Cricket",
          stage: "Group Match",
          matchOrder: 10,
          teamA: "Trichy Titans",
          teamB: "Pallava Strikers",
          scoreA: "154/3",
          scoreB: "109/7",
          status: "COMPLETED",
          scheduledTime: "11 Feb 2025",
          venue: "IIITT Cricket Ground",
          resultSummary: "Trichy Titans won Opening Match by 45 runs",
          detailedBreakdown: "Player of the Match: Aditi Menon (71).",
          scorerUserId: scorerUser?.id || null,
        },
      ]);
    }

    if (t2024) {
      const [win24, ru1_24, ru2_24] = await db
        .insert(tournamentTeams)
        .values([
          {
            tournamentId: t2024.id,
            sportName: "Football",
            teamName: "Chola Rovers",
            placement: "WINNER",
            played: 3,
            won: 3,
            lost: 0,
            drawn: 0,
            points: 9,
            nrrOrDiff: "+7",
          },
          {
            tournamentId: t2024.id,
            sportName: "Football",
            teamName: "Kaveri United",
            placement: "RUNNER_UP_1",
            played: 3,
            won: 2,
            lost: 1,
            drawn: 0,
            points: 6,
            nrrOrDiff: "+2",
          },
          {
            tournamentId: t2024.id,
            sportName: "Football",
            teamName: "Rockfort XI",
            placement: "RUNNER_UP_2",
            played: 3,
            won: 1,
            lost: 2,
            drawn: 0,
            points: 3,
            nrrOrDiff: "-3",
          },
        ])
        .returning();

      if (win24 && ru1_24 && ru2_24) {
        await db.insert(teamRosterMembers).values([
          {
            teamId: win24.id,
            playerName: "Siddharth Iyer",
            playerRole: "Captain / Striker",
            batchYear: "MTECH",
            branch: "CSE",
          },
          {
            teamId: ru1_24.id,
            playerName: "Karthik Nair",
            playerRole: "Midfielder",
            batchYear: "2ND",
            branch: "CSE",
          },
          {
            teamId: ru2_24.id,
            playerName: "Aditi Menon",
            playerRole: "Defender",
            batchYear: "1ST",
            branch: "ECE",
          },
        ]);
      }

      await db.insert(tournamentMatches).values([
        {
          tournamentId: t2024.id,
          sportName: "Football",
          stage: "Final",
          matchOrder: 20,
          teamA: "Chola Rovers",
          teamB: "Kaveri United",
          scoreA: "2",
          scoreB: "1",
          status: "COMPLETED",
          scheduledTime: "20 Oct 2024",
          venue: "Main Football Ground",
          resultSummary: "Chola Rovers won the Final 2-1",
          detailedBreakdown: "Player of the Match: Siddharth Iyer (2 Goals).",
          scorerUserId: scorerUser?.id || null,
        },
        {
          tournamentId: t2024.id,
          sportName: "Football",
          stage: "Group Match",
          matchOrder: 10,
          teamA: "Chola Rovers",
          teamB: "Rockfort XI",
          scoreA: "4",
          scoreB: "0",
          status: "COMPLETED",
          scheduledTime: "12 Oct 2024",
          venue: "Main Football Ground",
          resultSummary: "Chola Rovers won Opening Match 4-0",
          detailedBreakdown: "Player of the Match: Siddharth Iyer (Hat-trick).",
          scorerUserId: scorerUser?.id || null,
        },
      ]);
    }
  }

  console.log("Seed completed successfully.");
}

seed()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) {
      await pool.end();
    }
  });
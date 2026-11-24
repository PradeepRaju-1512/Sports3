import type {
  AuctionConfig,
  AuctionRegistration,
  AuctionRound,
  BidEvent,
  FranchiseSummary,
  LiveAuctionSnapshot,
} from "../types/auction.js";

export interface DemoUserRecord {
  id: number;
  name: string;
  email: string;
  rollNumber: string | null;
  batch: string;
  branch: string;
  role: string;
  createdAt: Date;
}

export interface NoticeRecord {
  id: number;
  title: string;
  summary: string;
  category: string;
  isUrgentBanner: boolean;
  createdAt: Date;
}

export interface ClubRecord {
  id: number;
  slug: string;
  name: string;
  groupType: string;
  description: string;
  venue: string;
  inductionOpen: boolean;
  sortOrder: number;
}

export interface MembershipRecord {
  id: number;
  clubId: number;
  userId: number;
  memberRole: string;
  batchScope: string;
  status: string;
  createdAt: Date;
}

export interface ActivityRecord {
  id: number;
  clubId: number;
  activityType: string;
  targetBatch: string;
  categoryGender: string;
  scheduledLabel: string;
  venue: string;
  createdByUserId: number | null;
  createdAt: Date;
}

export interface NotificationRecord {
  id: number;
  userId: number;
  clubId: number | null;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface TournamentRecord {
  id: number;
  name: string;
  year: number;
  semester: string;
  tournamentType: string;
  competitionFormat: string;
  dateRange: string;
  structureNotes: string;
  sportsIncluded: string;
  status: string;
  createdAt: Date;
}

export interface TournamentTeamRecord {
  id: number;
  tournamentId: number;
  sportName: string;
  teamName: string;
  placement: string | null;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
  nrrOrDiff: string;
}

export interface RosterMemberRecord {
  id: number;
  teamId: number;
  playerName: string;
  playerRole: string;
  batchYear: string;
  branch: string;
}

export interface MatchRecord {
  id: number;
  tournamentId: number;
  sportName: string;
  stage: string;
  matchOrder: number;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
  status: string;
  scheduledTime: string;
  venue: string;
  resultSummary: string;
  detailedBreakdown: string;
  scorerUserId: number | null;
}

interface RawFranchise {
  id: number;
  slotNumber: number;
  name: string;
  shortCode: string;
  accentColor: string;
  captainName: string;
  totalPurse: number;
}

const now = new Date();

export const demoStore = {
  users: [
    {
      id: 1,
      name: "Karthik Nair",
      email: "karthik.22@iiitt.ac.in",
      rollNumber: "CS22B1012",
      batch: "4TH",
      branch: "CSE",
      role: "SPORTS_SECRETARY",
      createdAt: now,
    },
    {
      id: 2,
      name: "Dr. R. Sundaram",
      email: "sundaram@iiitt.ac.in",
      rollNumber: "FAC004",
      batch: "STAFF",
      branch: "PED",
      role: "FACULTY_ADVISOR",
      createdAt: now,
    },
    {
      id: 3,
      name: "Aditi Menon",
      email: "aditi.23@iiitt.ac.in",
      rollNumber: "EC23B1024",
      batch: "3RD",
      branch: "ECE",
      role: "CLUB_SECRETARY",
      createdAt: now,
    },
    {
      id: 4,
      name: "Rohan Verma",
      email: "rohan.24@iiitt.ac.in",
      rollNumber: "CS24B1041",
      batch: "2ND",
      branch: "CSE",
      role: "CLUB_COORDINATOR",
      createdAt: now,
    },
    {
      id: 5,
      name: "Arjun Das",
      email: "arjun.23@iiitt.ac.in",
      rollNumber: "CS23B1019",
      batch: "3RD",
      branch: "CSE",
      role: "MATCH_SCORER",
      createdAt: now,
    },
    {
      id: 6,
      name: "Vikram Rao",
      email: "vikram.22@iiitt.ac.in",
      rollNumber: "EC22B1008",
      batch: "4TH",
      branch: "ECE",
      role: "AUCTION_OPERATOR",
      createdAt: now,
    },
    {
      id: 7,
      name: "Meera Krishnan",
      email: "meera.25@iiitt.ac.in",
      rollNumber: "ME25B1018",
      batch: "1ST",
      branch: "MECH",
      role: "CLUB_MEMBER",
      createdAt: now,
    },
    {
      id: 8,
      name: "Siddharth Iyer",
      email: "siddharth.m25@iiitt.ac.in",
      rollNumber: "CS25M1005",
      batch: "MTECH",
      branch: "CSE",
      role: "CLUB_MEMBER",
      createdAt: now,
    },
    {
      id: 9,
      name: "Ananya Reddy",
      email: "ananya.25@iiitt.ac.in",
      rollNumber: "EC25B1033",
      batch: "1ST",
      branch: "ECE",
      role: "STUDENT",
      createdAt: now,
    },
  ] as DemoUserRecord[],

  notices: [
    {
      id: 1,
      title: "Semester Sports Trials & Club Inductions Open",
      summary:
        "All 9 clubs are scheduling batch-wise practice and induction sessions this week.",
      category: "TRIAL",
      isUrgentBanner: true,
      createdAt: now,
    },
    {
      id: 2,
      title: "Prothymos Registration Window Announced",
      summary:
        "Students can enroll across multiple sports and positions with CLUB vs. NON_CLUB base prices.",
      category: "TOURNAMENT",
      isUrgentBanner: false,
      createdAt: now,
    },
    {
      id: 3,
      title: "Evening Ground & Hall Timings Updated",
      summary:
        "Outdoor team drills start at 5:00 PM; indoor hall sessions run in structured slots.",
      category: "GENERAL",
      isUrgentBanner: false,
      createdAt: now,
    },
  ] as NoticeRecord[],

  clubs: [
    {
      id: 1,
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
      id: 2,
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
      id: 3,
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
      id: 4,
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
      id: 5,
      slug: "kabaddi",
      name: "Kabaddi",
      groupType: "OUTDOOR_TEAM",
      description:
        "Raid conditioning, defensive holds, and mat/ground scrimmages.",
      venue: "Kabaddi Arena",
      inductionOpen: true,
      sortOrder: 5,
    },
    {
      id: 6,
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
      id: 7,
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
      id: 8,
      slug: "carrom",
      name: "Carrom",
      groupType: "INDOOR_GAME",
      description:
        "Precision breaks, doubles boards, and semester indoor fixtures.",
      venue: "Indoor Recreation Room",
      inductionOpen: true,
      sortOrder: 8,
    },
    {
      id: 9,
      slug: "chess",
      name: "Chess",
      groupType: "INDOOR_GAME",
      description:
        "Rapid & blitz arenas, opening prep, and inter-batch tournaments.",
      venue: "Seminar & Chess Lounge",
      inductionOpen: true,
      sortOrder: 9,
    },
  ] as ClubRecord[],

  memberships: [] as MembershipRecord[],
  activities: [] as ActivityRecord[],
  notifications: [] as NotificationRecord[],

  tournaments: [
    {
      id: 1,
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
      createdAt: now,
    },
    {
      id: 2,
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
      createdAt: now,
    },
    {
      id: 3,
      name: "Prothymos Championship 2025",
      year: 2025,
      semester: "EVEN",
      tournamentType: "PROTHYMOS",
      competitionFormat: "LEAGUE_KNOCKOUT",
      dateRange: "Feb 10 – Feb 19, 2025",
      structureNotes: "Archived 2025 Prothymos edition.",
      sportsIncluded: "Cricket,Football,Badminton",
      status: "ARCHIVED",
      createdAt: now,
    },
    {
      id: 4,
      name: "Autumn Sports Meet 2024",
      year: 2024,
      semester: "ODD",
      tournamentType: "INTER_BATCH",
      competitionFormat: "KNOCKOUT",
      dateRange: "Oct 12 – Oct 20, 2024",
      structureNotes: "Archived 2024 Autumn Sports Meet.",
      sportsIncluded: "Football,Cricket,Volleyball",
      status: "ARCHIVED",
      createdAt: now,
    },
  ] as TournamentRecord[],

  tournamentTeams: [
    {
      id: 1,
      tournamentId: 1,
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
      id: 2,
      tournamentId: 1,
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
      id: 3,
      tournamentId: 1,
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
      id: 4,
      tournamentId: 1,
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
      id: 5,
      tournamentId: 1,
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
    {
      id: 6,
      tournamentId: 3,
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
      id: 7,
      tournamentId: 3,
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
      id: 8,
      tournamentId: 3,
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
    {
      id: 9,
      tournamentId: 4,
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
      id: 10,
      tournamentId: 4,
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
      id: 11,
      tournamentId: 4,
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
  ] as TournamentTeamRecord[],

  rosterMembers: [
    {
      id: 1,
      teamId: 6,
      playerName: "Karthik Nair",
      playerRole: "Captain / All-Rounder",
      batchYear: "3RD",
      branch: "CSE",
    },
    {
      id: 2,
      teamId: 6,
      playerName: "Aditi Menon",
      playerRole: "Top-Order Batter",
      batchYear: "2ND",
      branch: "ECE",
    },
    {
      id: 3,
      teamId: 7,
      playerName: "Rohan Verma",
      playerRole: "Captain / Pace Bowler",
      batchYear: "1ST",
      branch: "CSE",
    },
    {
      id: 4,
      teamId: 8,
      playerName: "Siddharth Iyer",
      playerRole: "Wicketkeeper / Batter",
      batchYear: "MTECH",
      branch: "CSE",
    },
    {
      id: 5,
      teamId: 9,
      playerName: "Siddharth Iyer",
      playerRole: "Captain / Striker",
      batchYear: "MTECH",
      branch: "CSE",
    },
    {
      id: 6,
      teamId: 10,
      playerName: "Karthik Nair",
      playerRole: "Midfielder",
      batchYear: "2ND",
      branch: "CSE",
    },
    {
      id: 7,
      teamId: 11,
      playerName: "Aditi Menon",
      playerRole: "Defender",
      batchYear: "1ST",
      branch: "ECE",
    },
  ] as RosterMemberRecord[],

  matches: [
    {
      id: 1,
      tournamentId: 1,
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
      scorerUserId: 5,
    },
    {
      id: 2,
      tournamentId: 1,
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
      scorerUserId: 5,
    },
    {
      id: 3,
      tournamentId: 1,
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
      scorerUserId: 5,
    },
    {
      id: 4,
      tournamentId: 1,
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
      scorerUserId: 5,
    },
    {
      id: 5,
      tournamentId: 3,
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
      scorerUserId: 5,
    },
    {
      id: 6,
      tournamentId: 3,
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
      scorerUserId: 5,
    },
    {
      id: 7,
      tournamentId: 3,
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
      scorerUserId: 5,
    },
    {
      id: 8,
      tournamentId: 4,
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
      scorerUserId: 5,
    },
    {
      id: 9,
      tournamentId: 4,
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
      scorerUserId: 5,
    },
  ] as MatchRecord[],
};

// Seed default memberships & activities for all 9 clubs in demoStore
let memId = 1;
let actId = 1;
for (const club of demoStore.clubs) {
  demoStore.memberships.push(
    {
      id: memId++,
      clubId: club.id,
      userId: 3,
      memberRole: "SECRETARY",
      batchScope: "ALL",
      status: "INDUCTED",
      createdAt: now,
    },
    {
      id: memId++,
      clubId: club.id,
      userId: 4,
      memberRole: "COORDINATOR",
      batchScope: "2ND",
      status: "INDUCTED",
      createdAt: now,
    },
    {
      id: memId++,
      clubId: club.id,
      userId: 7,
      memberRole: "MEMBER",
      batchScope: "1ST",
      status: "INDUCTED",
      createdAt: now,
    },
    {
      id: memId++,
      clubId: club.id,
      userId: 8,
      memberRole: "MEMBER",
      batchScope: "MTECH",
      status: "INDUCTED",
      createdAt: now,
    },
    {
      id: memId++,
      clubId: club.id,
      userId: 9,
      memberRole: "MEMBER",
      batchScope: "1ST",
      status: "APPLIED",
      createdAt: now,
    }
  );
  demoStore.activities.push(
    {
      id: actId++,
      clubId: club.id,
      activityType: "Practice",
      targetBatch: "4th Year",
      categoryGender: "Boys",
      scheduledLabel: "Today, 5:00 PM",
      venue: club.venue,
      createdByUserId: 3,
      createdAt: now,
    },
    {
      id: actId++,
      clubId: club.id,
      activityType: "Induction",
      targetBatch: "All Batches",
      categoryGender: "Open",
      scheduledLabel: "Tomorrow, 4:30 PM",
      venue: club.venue,
      createdByUserId: 3,
      createdAt: now,
    }
  );
}

demoStore.notifications.push({
  id: 1,
  userId: 7,
  clubId: 1,
  message:
    "Football: Practice · 4th Year · Boys · Today, 5:00 PM at Main Football Ground",
  isRead: false,
  createdAt: now,
});

// --- SLICE 3: AUCTION STATE & LIVE SYNC ENGINE ---

const rawFranchises: RawFranchise[] = [
  {
    id: 1,
    slotNumber: 1,
    name: "Trichy Titans",
    shortCode: "TT",
    accentColor: "#d4a038",
    captainName: "Karthik Nair",
    totalPurse: 150000,
  },
  {
    id: 2,
    slotNumber: 2,
    name: "Cauvery Kings",
    shortCode: "CK",
    accentColor: "#b91c1c",
    captainName: "Rohan Verma",
    totalPurse: 150000,
  },
  {
    id: 3,
    slotNumber: 3,
    name: "Chola Rovers",
    shortCode: "CR",
    accentColor: "#2563eb",
    captainName: "Siddharth Iyer",
    totalPurse: 150000,
  },
  {
    id: 4,
    slotNumber: 4,
    name: "Pallava Strikers",
    shortCode: "PS",
    accentColor: "#16a34a",
    captainName: "Aditi Menon",
    totalPurse: 150000,
  },
];

export const auctionState = {
  auction: {
    id: 1,
    name: "Prothymos 2027 Mega Auction",
    seasonYear: 2027,
    sports: ["Cricket", "Football", "Volleyball", "Badminton", "Kabaddi"],
    status: "REGISTRATION_OPEN",
    registrationDeadline: "Feb 08, 2027 · 11:59 PM",
    clubBasePrice: 10000,
    nonClubBasePrice: 5000,
    defaultIncrement: 1000,
    jumpIncrement: 5000,
    minSquadSize: 8,
    maxSquadSize: 15,
    minClubPlayers: 3,
    minNonClubPlayers: 2,
    activeRoundId: 1,
    activeSport: "Cricket",
    currentPlayerId: 1,
    projectorMode: "STAGE",
    lastUpdatedAt: new Date().toLocaleTimeString(),
  } as AuctionConfig,

  rounds: [
    {
      id: 1,
      auctionId: 1,
      roundNumber: 1,
      name: "Round 1 · Main Pool",
      status: "ACTIVE",
    },
    {
      id: 2,
      auctionId: 1,
      roundNumber: 2,
      name: "Round 2 · Accelerated",
      status: "PENDING",
    },
    {
      id: 3,
      auctionId: 1,
      roundNumber: 3,
      name: "Round 3 · RTM / Unsold",
      status: "PENDING",
    },
  ] as AuctionRound[],

  registrations: [
    {
      id: 1,
      auctionId: 1,
      userId: 4,
      playerName: "Rohan Verma",
      rollNumber: "CS24B1041",
      yearLabel: "2nd Year",
      branch: "CSE",
      sport: "Cricket",
      positions: ["All-Rounder", "Bowler"],
      playerClass: "CLUB",
      basePrice: 10000,
      tier: "MARQUEE",
      roundId: 1,
      status: "IN_AUCTION",
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: "2026 Top Scorer · 185 runs & 9 wickets in 4 matches",
    },
    {
      id: 2,
      auctionId: 1,
      userId: 3,
      playerName: "Aditi Menon",
      rollNumber: "EC23B1024",
      yearLabel: "3rd Year",
      branch: "ECE",
      sport: "Cricket",
      positions: ["Batsman", "Wicketkeeper"],
      playerClass: "CLUB",
      basePrice: 10000,
      tier: "MARQUEE",
      roundId: 1,
      status: "ELIGIBLE",
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: "Prothymos 2025 Opening Match POTM (71 runs)",
    },
    {
      id: 3,
      auctionId: 1,
      userId: 8,
      playerName: "Siddharth Iyer",
      rollNumber: "CS25M1005",
      yearLabel: "MTech",
      branch: "CSE",
      sport: "Football",
      positions: ["Forward / Striker", "Midfielder"],
      playerClass: "CLUB",
      basePrice: 10000,
      tier: "MARQUEE",
      roundId: 1,
      status: "ELIGIBLE",
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: "2024 Golden Boot · 7 goals in Autumn Sports Meet",
    },
    {
      id: 4,
      auctionId: 1,
      userId: 7,
      playerName: "Meera Krishnan",
      rollNumber: "ME25B1018",
      yearLabel: "1st Year",
      branch: "MECH",
      sport: "Badminton",
      positions: ["Singles", "Doubles"],
      playerClass: "CLUB",
      basePrice: 10000,
      tier: "TIER_1",
      roundId: 1,
      status: "ELIGIBLE",
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: "Inter-batch Indoor Singles Finalist",
    },
    {
      id: 5,
      auctionId: 1,
      userId: 9,
      playerName: "Ananya Reddy",
      rollNumber: "EC25B1033",
      yearLabel: "1st Year",
      branch: "ECE",
      sport: "Cricket",
      positions: ["Batsman"],
      playerClass: "NON_CLUB",
      basePrice: 5000,
      tier: "UNCAPPED",
      roundId: 1,
      status: "ELIGIBLE",
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: "Inter-hostel standout opener",
    },
  ] as AuctionRegistration[],

  bidHistory: [] as BidEvent[],
};

export function computeFranchiseSummaries(): FranchiseSummary[] {
  const cfg = auctionState.auction;
  const minPrice = Math.min(cfg.clubBasePrice, cfg.nonClubBasePrice);

  return rawFranchises.map((f) => {
    const owned = auctionState.registrations.filter(
      (r) => r.status === "SOLD" && r.soldToFranchiseId === f.id
    );
    const spent = owned.reduce((acc, r) => acc + (r.soldPrice || 0), 0);
    const remainingPurse = Math.max(0, f.totalPurse - spent);
    const squadCount = owned.length;
    const clubCount = owned.filter((r) => r.playerClass === "CLUB").length;
    const nonClubCount = owned.filter(
      (r) => r.playerClass === "NON_CLUB"
    ).length;

    const remainingMinSlots = Math.max(0, cfg.minSquadSize - squadCount - 1);
    const reserveNeeded = remainingMinSlots * minPrice;
    const maxAllowedBid = Math.max(0, remainingPurse - reserveNeeded);

    let isEligibleToBid = true;
    let lockReason: string | undefined;

    if (squadCount >= cfg.maxSquadSize) {
      isEligibleToBid = false;
      lockReason = "Max squad size reached";
    } else if (maxAllowedBid < minPrice) {
      isEligibleToBid = false;
      lockReason = "Purse reserve guardrail";
    }

    return {
      ...f,
      remainingPurse,
      squadCount,
      clubCount,
      nonClubCount,
      maxAllowedBid,
      isEligibleToBid,
      lockReason,
    };
  });
}

export function buildLiveAuctionSnapshot(): LiveAuctionSnapshot {
  return {
    auction: auctionState.auction,
    rounds: auctionState.rounds,
    registrations: auctionState.registrations,
    franchises: computeFranchiseSummaries(),
    bidHistory: auctionState.bidHistory,
    serverTime: new Date().toISOString(),
  };
}

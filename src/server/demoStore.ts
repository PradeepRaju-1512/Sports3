import type {
  AuctionConfig,
  AuctionRegistration,
  AuctionRound,
  BidEvent,
  FranchiseSummary,
  LiveAuctionDelta,
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
  passwordHash?: string | null;
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
  scheduledAt: string | null;
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
  captainUserId: number | null;
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
  userId: number | null;
  playerName: string;
  playerRole: string;
  batchYear: string;
  branch: string;
}

export interface TeamSubmissionPlayer {
  userId?: number | null;
  name: string;
  role: string;
  jersey?: string;
}

export interface TeamSubmissionRecord {
  id: number;
  tournamentId: number;
  teamId: number | null;
  sportName: string;
  teamName: string;
  captainUserId: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "LOCKED" | "CHANGES_REQUESTED";
  players: TeamSubmissionPlayer[];
  reviewerNotes: string;
  updatedAt: string;
  createdAt: string;
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
  scheduledAt: string | null;
  venue: string;
  resultSummary: string;
  detailedBreakdown: string;
  scoringEventsJson?: string | null;
  scoringStateJson?: string | null;
  lineupAJson?: string | null;
  lineupBJson?: string | null;
  scorerUserId: number | null;
}

export interface PlayerPhotoRecord {
  publicKey: string;
  uploadedByUserId: number | null;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
  createdAt: string;
}

const now = new Date();
const today5pm = new Date();
today5pm.setHours(17, 0, 0, 0);
const tomorrow430pm = new Date(Date.now() + 24 * 60 * 60 * 1000);
tomorrow430pm.setHours(16, 30, 0, 0);
const tomorrow5pm = new Date(Date.now() + 24 * 60 * 60 * 1000);
tomorrow5pm.setHours(17, 0, 0, 0);

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
    {
      id: 10,
      name: "Devansh Kulkarni",
      email: "devansh.23@iiitt.ac.in",
      rollNumber: "CS23B1048",
      batch: "3RD",
      branch: "CSE",
      role: "CAPTAIN",
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
      captainUserId: 10,
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
      captainUserId: 1,
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
      captainUserId: 4,
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
      captainUserId: 10,
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
      captainUserId: 8,
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
      captainUserId: 1,
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
      captainUserId: 4,
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
      captainUserId: 8,
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
      captainUserId: 8,
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
      captainUserId: 1,
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
      captainUserId: 3,
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
    // Current tournament rosters (linked to real userIds)
    { id: 101, teamId: 1, userId: 10, playerName: "Devansh Kulkarni", playerRole: "Captain / Batter", batchYear: "3RD", branch: "CSE" },
    { id: 102, teamId: 1, userId: 4, playerName: "Rohan Verma", playerRole: "All-Rounder", batchYear: "2ND", branch: "CSE" },
    { id: 103, teamId: 1, userId: 7, playerName: "Meera Krishnan", playerRole: "Bowler", batchYear: "1ST", branch: "MECH" },
    { id: 104, teamId: 2, userId: 1, playerName: "Karthik Nair", playerRole: "Captain / Bowler", batchYear: "4TH", branch: "CSE" },
    { id: 105, teamId: 2, userId: 3, playerName: "Aditi Menon", playerRole: "Wicketkeeper", batchYear: "3RD", branch: "ECE" },
    { id: 106, teamId: 2, userId: 9, playerName: "Ananya Reddy", playerRole: "Batter", batchYear: "1ST", branch: "ECE" },
    { id: 107, teamId: 3, userId: 6, playerName: "Vikram Rao", playerRole: "Captain / All-Rounder", batchYear: "4TH", branch: "ECE" },
    { id: 108, teamId: 3, userId: 5, playerName: "Arjun Das", playerRole: "Bowler", batchYear: "3RD", branch: "CSE" },
    { id: 109, teamId: 4, userId: 10, playerName: "Devansh Kulkarni", playerRole: "Captain / Midfielder", batchYear: "3RD", branch: "CSE" },
    { id: 110, teamId: 4, userId: 8, playerName: "Siddharth Iyer", playerRole: "Striker", batchYear: "MTECH", branch: "CSE" },
    { id: 111, teamId: 5, userId: 6, playerName: "Vikram Rao", playerRole: "Defender", batchYear: "4TH", branch: "ECE" },
    // Archive rosters
    { id: 1, teamId: 6, userId: 1, playerName: "Karthik Nair", playerRole: "Captain / All-Rounder", batchYear: "3RD", branch: "CSE" },
    { id: 2, teamId: 6, userId: 3, playerName: "Aditi Menon", playerRole: "Top-Order Batter", batchYear: "2ND", branch: "ECE" },
    { id: 3, teamId: 7, userId: 4, playerName: "Rohan Verma", playerRole: "Captain / Pace Bowler", batchYear: "1ST", branch: "CSE" },
    { id: 4, teamId: 8, userId: 8, playerName: "Siddharth Iyer", playerRole: "Wicketkeeper / Batter", batchYear: "MTECH", branch: "CSE" },
    { id: 5, teamId: 9, userId: 8, playerName: "Siddharth Iyer", playerRole: "Captain / Striker", batchYear: "MTECH", branch: "CSE" },
    { id: 6, teamId: 10, userId: 1, playerName: "Karthik Nair", playerRole: "Midfielder", batchYear: "2ND", branch: "CSE" },
    { id: 7, teamId: 11, userId: 3, playerName: "Aditi Menon", playerRole: "Defender", batchYear: "1ST", branch: "ECE" },
  ] as RosterMemberRecord[],

  teamSubmissions: [
    {
      id: 1,
      tournamentId: 1,
      teamId: 1,
      sportName: "Cricket",
      teamName: "Trichy Titans",
      captainUserId: 10,
      status: "APPROVED",
      players: [
        { userId: 10, name: "Devansh Kulkarni", role: "Captain / Batter", jersey: "7" },
        { userId: 4, name: "Rohan Verma", role: "All-Rounder", jersey: "18" },
        { userId: 7, name: "Meera Krishnan", role: "Bowler", jersey: "24" },
      ],
      reviewerNotes: "Verified eligible squad for Odd Semester Championship.",
      updatedAt: now.toISOString(),
      createdAt: now.toISOString(),
    },
    {
      id: 2,
      tournamentId: 1,
      teamId: 4,
      sportName: "Football",
      teamName: "Kaveri United",
      captainUserId: 10,
      status: "SUBMITTED",
      players: [
        { userId: 10, name: "Devansh Kulkarni", role: "Captain / Midfielder", jersey: "10" },
        { userId: 8, name: "Siddharth Iyer", role: "Striker", jersey: "9" },
      ],
      reviewerNotes: "",
      updatedAt: now.toISOString(),
      createdAt: now.toISOString(),
    },
  ] as TeamSubmissionRecord[],

  playerPhotos: new Map<string, PlayerPhotoRecord>(),

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
      scheduledTime: now.toISOString(),
      scheduledAt: now.toISOString(),
      venue: "IIITT Cricket Ground",
      resultSummary: "In Progress — Powerplay & middle overs underway",
      detailedBreakdown:
        "Top Performers: R. Verma 41*(26), K. Nair 2/18.\nVenue: IIITT Cricket Ground.",
      scoringEventsJson: null,
      scoringStateJson: null,
      lineupAJson: null,
      lineupBJson: null,
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
      scheduledTime: tomorrow5pm.toISOString(),
      scheduledAt: tomorrow5pm.toISOString(),
      venue: "IIITT Cricket Ground",
      resultSummary: "Scheduled",
      detailedBreakdown: "15-over floodlight semi-final fixture.",
      scoringEventsJson: null,
      scoringStateJson: null,
      lineupAJson: null,
      lineupBJson: null,
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
      scheduledTime: "2026-11-22T11:30:00.000Z",
      scheduledAt: "2026-11-22T11:30:00.000Z",
      venue: "IIITT Cricket Ground",
      resultSummary: "Trichy Titans won by 36 runs",
      detailedBreakdown:
        "Top Performers: R. Verma 58(34), A. Menon 3/14.\nOpening fixture completed.",
      scoringEventsJson: null,
      scoringStateJson: null,
      lineupAJson: null,
      lineupBJson: null,
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
      scheduledTime: "2026-11-21T11:30:00.000Z",
      scheduledAt: "2026-11-21T11:30:00.000Z",
      venue: "Main Football Ground",
      resultSummary: "Kaveri United won by 2 goals",
      detailedBreakdown:
        "Top Performers: S. Iyer (2 Goals, 1 Assist).\nFull-time 70 mins.",
      scoringEventsJson: null,
      scoringStateJson: null,
      lineupAJson: null,
      lineupBJson: null,
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
      scheduledTime: "2025-02-19T12:00:00.000Z",
      scheduledAt: "2025-02-19T12:00:00.000Z",
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
      scheduledTime: "2025-02-17T12:00:00.000Z",
      scheduledAt: "2025-02-17T12:00:00.000Z",
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
      scheduledTime: "2025-02-11T12:00:00.000Z",
      scheduledAt: "2025-02-11T12:00:00.000Z",
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
      scheduledTime: "2024-10-20T12:00:00.000Z",
      scheduledAt: "2024-10-20T12:00:00.000Z",
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
      scheduledTime: "2024-10-12T12:00:00.000Z",
      scheduledAt: "2024-10-12T12:00:00.000Z",
      venue: "Main Football Ground",
      resultSummary: "Chola Rovers won Opening Match 4-0",
      detailedBreakdown: "Player of the Match: Siddharth Iyer (Hat-trick).",
      scorerUserId: 5,
    },
  ] as MatchRecord[],
};

// Seed resource-scoped memberships & ISO-timestamped activities for all 9 clubs
let memId = 1;
let actId = 1;
for (const club of demoStore.clubs) {
  // Aditi Menon (3) is Secretary ONLY of Cricket & Badminton
  if (club.slug === "cricket" || club.slug === "badminton") {
    demoStore.memberships.push({
      id: memId++,
      clubId: club.id,
      userId: 3,
      memberRole: "SECRETARY",
      batchScope: "ALL",
      status: "INDUCTED",
      createdAt: now,
    });
  }
  // Rohan Verma (4) is 2nd-Year Coordinator ONLY of Cricket & Football
  if (club.slug === "cricket" || club.slug === "football") {
    demoStore.memberships.push({
      id: memId++,
      clubId: club.id,
      userId: 4,
      memberRole: "COORDINATOR",
      batchScope: "2ND",
      status: "INDUCTED",
      createdAt: now,
    });
  }
  demoStore.memberships.push(
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
      targetBatch: "4TH",
      categoryGender: "Boys",
      scheduledLabel: today5pm.toISOString(),
      scheduledAt: today5pm.toISOString(),
      venue: club.venue,
      createdByUserId: 1,
      createdAt: now,
    },
    {
      id: actId++,
      clubId: club.id,
      activityType: "Induction",
      targetBatch: "ALL",
      categoryGender: "Open",
      scheduledLabel: tomorrow430pm.toISOString(),
      scheduledAt: tomorrow430pm.toISOString(),
      venue: club.venue,
      createdByUserId: 1,
      createdAt: now,
    }
  );
}

demoStore.notifications.push(
  {
    id: 1,
    userId: 7,
    clubId: 1,
    message:
      "Football: Practice · 4TH · Boys at Main Football Ground",
    isRead: false,
    createdAt: now,
  },
  {
    id: 2,
    userId: 1,
    clubId: 2,
    message:
      "Captain Devansh Kulkarni submitted Kaveri United (Football) squad for review.",
    isRead: false,
    createdAt: now,
  }
);

// --- SLICE 3: AUCTION STATE & LIVE SYNC ENGINE (PER-SPORT PURSES & SQUADS) ---

export interface RawFranchise {
  id: number;
  auctionId: number;
  sport: string;
  slotNumber: number;
  name: string;
  shortCode: string;
  accentColor: string;
  captainName: string;
  captainUserId?: number | null;
  startingPurse: number;
  minSquadSize?: number | null;
  maxSquadSize?: number | null;
  minClubPlayers?: number | null;
  minNonClubPlayers?: number | null;
}

export const DEFAULT_POSITIONS_BY_SPORT: Record<string, string[]> = {
  Cricket: ["Batsman", "Bowler", "All-Rounder", "Wicketkeeper"],
  Football: ["Forward / Striker", "Midfielder", "Defender", "Goalkeeper"],
  Volleyball: ["Setter", "Outside Hitter", "Middle Blocker", "Libero"],
  Badminton: ["Singles", "Doubles", "Mixed"],
  Kabaddi: ["Raider", "Defender", "All-Rounder"],
  "Table Tennis": ["Singles", "Doubles"],
  "Kho Kho": ["Attacker / Chaser", "Defender / Runner"],
  Chess: ["Board 1–2", "Board 3–4", "Reserve"],
  Carrom: ["Singles", "Doubles"],
};

export const auctionState = {
  auction: {
    id: 1,
    name: "Prothymos 2027 Mega Auction",
    seasonYear: 2027,
    sports: ["Cricket", "Football", "Volleyball", "Badminton", "Kabaddi"],
    status: "LIVE",
    registrationDeadline: "2027-02-08T18:29:00.000Z",
    registrationDeadlineAt: "2027-02-08T18:29:00.000Z",
    clubBasePrice: 10000,
    nonClubBasePrice: 5000,
    sportBasePrices: {
      Football: { clubBasePrice: 8000, nonClubBasePrice: 4000 },
      Badminton: { clubBasePrice: 6000, nonClubBasePrice: 3000 },
    },
    defaultIncrement: 1000,
    jumpIncrement: 5000,
    minSquadSize: 8,
    maxSquadSize: 15,
    minClubPlayers: 3,
    minNonClubPlayers: 2,
    playerTiers: ["MARQUEE", "TIER_1", "TIER_2", "UNCAPPED"],
    positionsBySport: { ...DEFAULT_POSITIONS_BY_SPORT },
    activeRoundId: 1,
    activeSport: "Cricket",
    currentPlayerId: 1,
    projectorMode: "STAGE",
    version: 1,
    lastUpdatedAt: new Date().toISOString(),
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
      name: "Round 2 · Accelerated / Unsold",
      status: "PENDING",
    },
    {
      id: 3,
      auctionId: 1,
      roundNumber: 3,
      name: "Round 3 · RTM / Final",
      status: "PENDING",
    },
  ] as AuctionRound[],

  franchises: [
    // Cricket Franchises (dedicated Cricket purses & squads; captains distinct from Cricket pool)
    {
      id: 1,
      auctionId: 1,
      sport: "Cricket",
      slotNumber: 1,
      name: "Trichy Titans",
      shortCode: "TT",
      accentColor: "#d4a038",
      captainName: "Karthik Nair",
      startingPurse: 150000,
    },
    {
      id: 2,
      auctionId: 1,
      sport: "Cricket",
      slotNumber: 2,
      name: "Cauvery Kings",
      shortCode: "CK",
      accentColor: "#b91c1c",
      captainName: "Vikram Rao",
      startingPurse: 150000,
    },
    {
      id: 3,
      auctionId: 1,
      sport: "Cricket",
      slotNumber: 3,
      name: "Chola Rovers",
      shortCode: "CR",
      accentColor: "#2563eb",
      captainName: "Arjun Das",
      startingPurse: 150000,
    },
    {
      id: 4,
      auctionId: 1,
      sport: "Cricket",
      slotNumber: 4,
      name: "Pallava Strikers",
      shortCode: "PS",
      accentColor: "#16a34a",
      captainName: "Siddharth Iyer",
      startingPurse: 150000,
    },
    // Football Franchises (separate Football purses & squads)
    {
      id: 5,
      auctionId: 1,
      sport: "Football",
      slotNumber: 1,
      name: "Kaveri United",
      shortCode: "KU",
      accentColor: "#d4a038",
      captainName: "Karthik Nair",
      startingPurse: 120000,
    },
    {
      id: 6,
      auctionId: 1,
      sport: "Football",
      slotNumber: 2,
      name: "Chola Rovers FC",
      shortCode: "CR",
      accentColor: "#b91c1c",
      captainName: "Vikram Rao",
      startingPurse: 120000,
    },
    {
      id: 7,
      auctionId: 1,
      sport: "Football",
      slotNumber: 3,
      name: "Rockfort XI",
      shortCode: "RX",
      accentColor: "#2563eb",
      captainName: "Aditi Menon",
      startingPurse: 120000,
    },
    {
      id: 8,
      auctionId: 1,
      sport: "Football",
      slotNumber: 4,
      name: "Delta Dynamos FC",
      shortCode: "DD",
      accentColor: "#16a34a",
      captainName: "Rohan Verma",
      startingPurse: 120000,
    },
    // Volleyball Franchises
    {
      id: 9,
      auctionId: 1,
      sport: "Volleyball",
      slotNumber: 1,
      name: "Trichy Spikers",
      shortCode: "TS",
      accentColor: "#d4a038",
      captainName: "Vikram Rao",
      startingPurse: 100000,
    },
    {
      id: 10,
      auctionId: 1,
      sport: "Volleyball",
      slotNumber: 2,
      name: "Cauvery Blockers",
      shortCode: "CB",
      accentColor: "#b91c1c",
      captainName: "Arjun Das",
      startingPurse: 100000,
    },
    // Badminton Franchises
    {
      id: 11,
      auctionId: 1,
      sport: "Badminton",
      slotNumber: 1,
      name: "Shuttlers United",
      shortCode: "SU",
      accentColor: "#d4a038",
      captainName: "Aditi Menon",
      startingPurse: 80000,
    },
    {
      id: 12,
      auctionId: 1,
      sport: "Badminton",
      slotNumber: 2,
      name: "Smash Royals",
      shortCode: "SR",
      accentColor: "#2563eb",
      captainName: "Karthik Nair",
      startingPurse: 80000,
    },
    // Kabaddi Franchises
    {
      id: 13,
      auctionId: 1,
      sport: "Kabaddi",
      slotNumber: 1,
      name: "Chola Raiders",
      shortCode: "CR",
      accentColor: "#b91c1c",
      captainName: "Arjun Das",
      startingPurse: 100000,
    },
    {
      id: 14,
      auctionId: 1,
      sport: "Kabaddi",
      slotNumber: 2,
      name: "Trichy Defenders",
      shortCode: "TD",
      accentColor: "#16a34a",
      captainName: "Vikram Rao",
      startingPurse: 100000,
    },
  ] as RawFranchise[],

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
      photoUrl: "/uploads/players/rohan-verma.jpg",
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
      photoUrl: "/uploads/players/aditi-menon.jpg",
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
      basePrice: 8000,
      tier: "MARQUEE",
      roundId: 1,
      status: "ELIGIBLE",
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: "2024 Golden Boot · 7 goals in Autumn Sports Meet",
      photoUrl: "/uploads/players/siddharth-iyer.jpg",
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
      basePrice: 6000,
      tier: "TIER_1",
      roundId: 1,
      status: "ELIGIBLE",
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: "Inter-batch Indoor Singles Finalist",
      photoUrl: "/uploads/players/meera-krishnan.jpg",
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
      photoUrl: "/uploads/players/ananya-reddy.jpg",
    },
    {
      id: 6,
      auctionId: 1,
      userId: 7,
      playerName: "Meera Krishnan",
      rollNumber: "ME25B1018",
      yearLabel: "1st Year",
      branch: "MECH",
      sport: "Cricket",
      positions: ["Bowler", "All-Rounder"],
      playerClass: "CLUB",
      basePrice: 10000,
      tier: "TIER_1",
      roundId: 1,
      status: "SOLD",
      soldToFranchiseId: 1, // Trichy Titans (Cricket)
      soldPrice: 22000,
      statsSummary: "2026 Inter-Batch Emerging All-Rounder",
      photoUrl: "/uploads/players/meera-krishnan.jpg",
    },
    {
      id: 7,
      auctionId: 1,
      userId: 5,
      playerName: "Arjun Das",
      rollNumber: "CS23B1019",
      yearLabel: "3rd Year",
      branch: "CSE",
      sport: "Football",
      positions: ["Midfielder", "Defender"],
      playerClass: "CLUB",
      basePrice: 8000,
      tier: "TIER_1",
      roundId: 1,
      status: "SOLD",
      soldToFranchiseId: 5, // Kaveri United (Football — separate purse from Cricket!)
      soldPrice: 16000,
      statsSummary: "2026 Inter-Batch Defensive Midfielder of the Meet",
      photoUrl: "/uploads/players/siddharth-iyer.jpg",
    },
  ] as AuctionRegistration[],

  bidHistory: [] as BidEvent[],
};

export function getEffectiveBasePrice(
  cfg: AuctionConfig,
  sport: string,
  playerClass: "CLUB" | "NON_CLUB"
): number {
  const override = cfg.sportBasePrices?.[sport];
  if (override) {
    return playerClass === "CLUB"
      ? Number(override.clubBasePrice)
      : Number(override.nonClubBasePrice);
  }
  return playerClass === "CLUB"
    ? Number(cfg.clubBasePrice)
    : Number(cfg.nonClubBasePrice);
}

export function computeFranchiseSummaries(): FranchiseSummary[] {
  const cfg = auctionState.auction;
  const activePlayer =
    auctionState.registrations.find((r) => r.id === cfg.currentPlayerId) ||
    null;

  return auctionState.franchises.map((f) => {
    const owned = auctionState.registrations.filter(
      (r) =>
        r.status === "SOLD" &&
        r.soldToFranchiseId === f.id &&
        r.sport.toLowerCase() === f.sport.toLowerCase()
    );

    const spentPurse = owned.reduce((acc, r) => acc + (r.soldPrice || 0), 0);
    const remainingPurse = Math.max(0, f.startingPurse - spentPurse);
    const squadCount = owned.length;
    const clubCount = owned.filter((r) => r.playerClass === "CLUB").length;
    const nonClubCount = owned.filter(
      (r) => r.playerClass === "NON_CLUB"
    ).length;

    const minSquad = f.minSquadSize ?? cfg.minSquadSize;
    const maxSquad = f.maxSquadSize ?? cfg.maxSquadSize;
    const minClub = f.minClubPlayers ?? cfg.minClubPlayers;
    const minNonClub = f.minNonClubPlayers ?? cfg.minNonClubPlayers;

    const clubPrice = getEffectiveBasePrice(cfg, f.sport, "CLUB");
    const nonClubPrice = getEffectiveBasePrice(cfg, f.sport, "NON_CLUB");
    const minPrice = Math.min(clubPrice, nonClubPrice);

    const isSameSportPlayer =
      Boolean(activePlayer) &&
      activePlayer!.sport.toLowerCase() === f.sport.toLowerCase();

    // Exact non-overlapping reserve computation (zero double-counting):
    // Count how many CLUB / NON_CLUB mandatory slots remain AFTER acquiring the active player,
    // and only add cheapest-base flexible slots for any remaining minSquad gap beyond those quotas.
    const nextSquadCount = squadCount + 1;
    const remClubAfterBuy = isSameSportPlayer
      ? Math.max(
          0,
          minClub - clubCount - (activePlayer!.playerClass === "CLUB" ? 1 : 0)
        )
      : Math.max(0, minClub - clubCount);

    const remNonClubAfterBuy = isSameSportPlayer
      ? Math.max(
          0,
          minNonClub -
            nonClubCount -
            (activePlayer!.playerClass === "NON_CLUB" ? 1 : 0)
        )
      : Math.max(0, minNonClub - nonClubCount);

    const remainingMinSlotsAfterBuy = Math.max(0, minSquad - nextSquadCount);
    const remainingMaxSlotsAfterBuy = Math.max(0, maxSquad - nextSquadCount);
    const mandatoryQuotaSlots = remClubAfterBuy + remNonClubAfterBuy;
    const extraFlexibleSlots = Math.max(
      0,
      remainingMinSlotsAfterBuy - mandatoryQuotaSlots
    );
    const reserveNeeded =
      remClubAfterBuy * clubPrice +
      remNonClubAfterBuy * nonClubPrice +
      extraFlexibleSlots * minPrice;

    const maxAllowedBid = Math.max(0, remainingPurse - reserveNeeded);

    let isEligibleToBid = true;
    let lockReason: string | undefined;

    if (squadCount >= maxSquad) {
      isEligibleToBid = false;
      lockReason = "Max squad size reached";
    } else if (
      isSameSportPlayer &&
      mandatoryQuotaSlots > remainingMaxSlotsAfterBuy
    ) {
      isEligibleToBid = false;
      lockReason = `Quota lock: reserve slots for ${remClubAfterBuy > 0 ? "CLUB" : "NON_CLUB"}`;
    } else if (
      isSameSportPlayer &&
      maxAllowedBid < activePlayer!.basePrice
    ) {
      isEligibleToBid = false;
      lockReason = "Purse reserve guardrail";
    } else if (!isSameSportPlayer && maxAllowedBid < minPrice) {
      isEligibleToBid = false;
      lockReason = "Purse reserve guardrail";
    }

    return {
      id: f.id,
      auctionId: f.auctionId,
      sport: f.sport,
      slotNumber: f.slotNumber,
      name: f.name,
      shortCode: f.shortCode,
      accentColor: f.accentColor,
      captainName: f.captainName,
      captainUserId: f.captainUserId ?? null,
      startingPurse: f.startingPurse,
      totalPurse: f.startingPurse,
      spentPurse,
      remainingPurse,
      minSquadSize: minSquad,
      maxSquadSize: maxSquad,
      minClubPlayers: minClub,
      minNonClubPlayers: minNonClub,
      squadCount,
      clubCount,
      nonClubCount,
      maxAllowedBid,
      isEligibleToBid,
      lockReason,
      purchasedPlayers: owned.map((p) => ({
        id: p.id,
        userId: p.userId,
        playerName: p.playerName,
        sport: p.sport,
        positions: p.positions,
        soldPrice: p.soldPrice || p.basePrice,
        playerClass: p.playerClass,
        photoUrl: p.photoUrl || null,
      })),
    };
  });
}

export function buildLiveAuctionSnapshot(): LiveAuctionSnapshot {
  return {
    version: auctionState.auction.version || 1,
    auction: auctionState.auction,
    rounds: [...auctionState.rounds].sort(
      (a, b) => a.roundNumber - b.roundNumber || a.id - b.id
    ),
    registrations: auctionState.registrations,
    franchises: computeFranchiseSummaries(),
    bidHistory: auctionState.bidHistory,
    serverTime: new Date().toISOString(),
  };
}

export function buildLiveAuctionDelta(opts?: {
  updatedRegistration?: AuctionRegistration | null;
  removedRegistrationId?: number | null;
  latestBidEvent?: BidEvent | null;
  includeRounds?: boolean;
}): LiveAuctionDelta {
  return {
    type: "AUCTION_DELTA",
    version: auctionState.auction.version || 1,
    auction: auctionState.auction,
    ...(opts?.includeRounds
      ? {
          rounds: [...auctionState.rounds].sort(
            (a, b) => a.roundNumber - b.roundNumber || a.id - b.id
          ),
        }
      : {}),
    ...(opts?.updatedRegistration !== undefined
      ? { updatedRegistration: opts.updatedRegistration }
      : {}),
    ...(opts?.removedRegistrationId !== undefined
      ? { removedRegistrationId: opts.removedRegistrationId }
      : {}),
    franchises: computeFranchiseSummaries(),
    ...(opts?.latestBidEvent !== undefined
      ? { latestBidEvent: opts.latestBidEvent }
      : {}),
    bidHistoryTail: auctionState.bidHistory.slice(0, 20),
    serverTime: new Date().toISOString(),
  };
}

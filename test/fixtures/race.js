// A small synthetic race state in the F1 feed's shapes: three fictional drivers.
// Hand-written, so no real F1 data is committed. Shapes match what the live feed sends.

function segments(done, total) {
  return Array.from({ length: total }, (_, i) => ({ Status: i < done ? 2048 : 0 }));
}

function line(number, position, extra = {}) {
  return {
    RacingNumber: number,
    Line: position,
    Position: String(position),
    ShowPosition: true,
    GapToLeader: position === 1 ? 'LAP 12' : `+${(position - 1) * 1.5}`,
    IntervalToPositionAhead: { Value: position === 1 ? 'LAP 12' : '+1.500', Catching: false },
    Retired: false,
    InPit: false,
    PitOut: false,
    Stopped: false,
    KnockedOut: false,
    NumberOfLaps: 11,
    NumberOfPitStops: 0,
    Sectors: [
      { Value: '22.500', Segments: segments(7, 7) },
      { Value: '', Segments: segments(3, 8) },
      { Value: '', Segments: segments(0, 9) },
    ],
    BestLapTime: { Value: '1:12.000', Lap: 9 },
    LastLapTime: { Value: '1:12.400', PersonalFastest: false, OverallFastest: false },
    ...extra,
  };
}

function raceState() {
  return {
    SessionInfo: {
      Meeting: { Key: 9001, Name: 'Harbour Grand Prix', Location: 'Harbour', Country: { Code: 'HBR', Name: 'Harbourland' }, Circuit: { Key: 777, ShortName: 'Harbour Park' } },
      Key: 90001, Type: 'Race', Name: 'Race', StartDate: '2026-06-01T14:00:00', Path: '2026/2026-06-01_Harbour_Grand_Prix/2026-06-01_Race/', _kf: true,
    },
    SessionStatus: { Status: 'Started', _kf: true },
    TrackStatus: { Status: '1', Message: 'AllClear', _kf: true },
    LapCount: { CurrentLap: 12, TotalLaps: 50, _kf: true },
    ExtrapolatedClock: { Utc: '2026-06-01T14:20:00.000Z', Remaining: '01:40:00', Extrapolating: true, _kf: true },
    SessionData: { StatusSeries: [{ Utc: '2026-06-01T14:02:00.000Z', SessionStatus: 'Started' }, { Utc: '2026-06-01T14:10:00.000Z', TrackStatus: 'AllClear' }], _kf: true },
    DriverList: {
      7: { RacingNumber: '7', Tla: 'ALP', FullName: 'Ada ALPHA', TeamName: 'Comet', TeamColour: 'E8002D', Line: 1 },
      8: { RacingNumber: '8', Tla: 'BRV', FullName: 'Ben BRAVO', TeamName: 'Nova', TeamColour: '3671C6', Line: 2 },
      9: { RacingNumber: '9', Tla: 'CHL', FullName: 'Cy CHARLIE', TeamName: 'Comet', TeamColour: 'E8002D', Line: 3 },
      _kf: true,
    },
    TimingData: { Lines: { 7: line('7', 1), 8: line('8', 2), 9: line('9', 3) }, Withheld: false, _kf: true },
    TimingAppData: {
      Lines: {
        7: { RacingNumber: '7', GridPos: '2', Stints: [{ Compound: 'MEDIUM', New: 'true', TotalLaps: 11, StartLaps: 0 }] },
        8: { RacingNumber: '8', GridPos: '1', Stints: [{ Compound: 'SOFT', New: 'false', TotalLaps: 14, StartLaps: 3 }] },
        9: { RacingNumber: '9', GridPos: '3', Stints: [{ Compound: 'HARD', New: 'true', TotalLaps: 11, StartLaps: 0 }] },
      },
      _kf: true,
    },
    TimingStats: { Lines: { 7: { PersonalBestLapTime: { Value: '1:12.000', Lap: 9, Position: 1 } }, 8: { PersonalBestLapTime: { Value: '1:12.300', Lap: 8, Position: 2 } } }, _kf: true },
    RaceControlMessages: { Messages: [{ Utc: '2026-06-01T14:01:00', Lap: 1, Category: 'Flag', Flag: 'GREEN', Message: 'GREEN LIGHT - PIT EXIT OPEN' }], _kf: true },
    WeatherData: { AirTemp: '24.1', Humidity: '50.0', Pressure: '1012.0', Rainfall: '0', TrackTemp: '38.5', WindDirection: '90', WindSpeed: '1.2', _kf: true },
  };
}

module.exports = { raceState, line, segments };

import { db } from '../db';

describe('db', () => {
  it('should be defined', () => {
    expect(db).toBeDefined();
  });

  it('should have geotiff table', () => {
    expect(db.geotiff).toBeDefined();
  });

  it('should have pmtiles table', () => {
    expect(db.pmtiles).toBeDefined();
  });
});

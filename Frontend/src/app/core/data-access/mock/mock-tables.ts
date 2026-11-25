import { EntityOf, ResourceName } from '../data-source';

/** Shape of the mock database: one array of records per resource. */
export type MockTables = { [K in ResourceName]: EntityOf<K>[] };

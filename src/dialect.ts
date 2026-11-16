import type { Connection } from './types';

/** Microsoft Fabric Warehouse: a SQL Server profile that says so, or whose host is a Fabric / Power BI endpoint (same rule as core/ddl.cjs). */
export const isFabric = (c: Connection) => c.driver === 'sqlsrv' && (c.fabric != null ? !!c.fabric : /\.(fabric|pbidedicated)\.microsoft\.com$/i.test(c.host || ''));

/** SQL dialect used to build DDL for a connection: 'fabric' is a variant of 'sqlsrv'. */
export const dialectOf = (c?: Connection) => (!c ? 'mysql' : isFabric(c) ? 'fabric' : c.driver);

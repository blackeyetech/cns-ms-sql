// imports here
import CNShell from "cn-shell";
import * as mssql from "mssql";

// MS-SQL config consts here
const CFG_MSSQL_USER = "MSSQL_USER";
const CFG_MSSQL_PASSWORD = "MSSQL_PASSWORD";
const CFG_MSSQL_DB = "MSSQL_DB";
const CFG_MSSQL_SERVER = "MSSQL_SERVER";
const CFG_MSSQL_PORT = "MSSQL_PORT";
const CFG_MSSQL_APP_NAME = "MSSQL_APP_NAME";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = "1433";

// Interfaces here
export interface CNMSSqlReadOptions {
  orderBy?: string[];
  orderByDesc?: string[];
  groupBy?: string[];
  format?: "json" | "array";
  distinct?: boolean;
}

// Class CNMSSql here
export class CNMSSql extends CNShell {
  // Properties here
  private _pool: mssql.ConnectionPool;

  private _user: string;
  private _password: string;
  private _database: string;
  private _dbSever: string;
  private _port: number;
  private _appName: string;

  // Constructor here
  constructor(name: string) {
    super(name);

    this._user = this.getRequiredCfg(CFG_MSSQL_USER);
    this._password = this.getRequiredCfg(CFG_MSSQL_PASSWORD, false, true);
    this._database = this.getRequiredCfg(CFG_MSSQL_DB);
    this._dbSever = this.getCfg(CFG_MSSQL_SERVER, DEFAULT_HOST);
    this._port = parseInt(this.getCfg(CFG_MSSQL_PORT, DEFAULT_PORT), 10);
    this._appName = this.getRequiredCfg(CFG_MSSQL_APP_NAME);
  }

  // Methods here
  async start(): Promise<boolean> {
    this.info("Starting ...");
    this.info("Opening the Pool ...");

    return new Promise((resolve, reject) => {
      this.isServerReady(resolve, reject);
    });
  }

  private async isServerReady(
    resolve: (ready: boolean) => void,
    reject: (ready: boolean) => void,
  ): Promise<void> {
    try {
      this._pool = await new mssql.ConnectionPool({
        user: this._user,
        password: this._password,
        database: this._database,
        server: this._dbSever,
        port: this._port,
        arrayRowMode: false,
        options: {
          encrypt: false, // true for azure
          trustServerCertificate: true, // true for self-signed certs
          appName: this._appName,
        },
      }).connect();
    } catch (e) {
      this.error("DB returned the following error: (%j)", e);
      setTimeout(() => {
        this.isServerReady(resolve, reject);
      }, 5000);
    }

    if (this._pool !== undefined) {
      this._pool.on("error", err => {
        console.log("sql errors", err);
      });

      this.info("MS-SQL DB ready");
      this.info("Started!");
      resolve(true);
    }
  }

  async stop(): Promise<void> {
    this.info("Stopping ...");

    if (this._pool !== undefined) {
      this.info("Closing the pool ...");

      await this._pool.close().catch(e => {
        this.error(e.message);
        return;
      });

      this.info("Pool closed!");
    }

    this.info("Stopped!");
  }

  async healthCheck(): Promise<boolean> {
    // Lets check if we can query the time
    const sql = "SELECT getdate();";

    let e: Error | undefined;

    await this._pool.query(sql).catch(err => {
      e = err;
      this.error(err);
    });

    if (e === undefined) {
      return true;
    } else {
      return false;
    }
  }

  async create(
    collection: string,
    fields: { [key: string]: any },
    id?: string,
  ): Promise<any> {
    let fieldsStr = "";
    let valuesStr = "";

    let position = 1;

    let request = new mssql.Request(this._pool);

    for (const f in fields) {
      if (position > 1) {
        fieldsStr += ",";
        valuesStr += ",";
      }

      fieldsStr += f;
      valuesStr += `@${f}`;

      request.input(f, fields[f]);
      position++;
    }

    let query = "";

    if (id !== undefined) {
      query = `INSERT INTO ${collection} (${fieldsStr}) OUTPUT INSERTED.${id} VALUES (${valuesStr})`;
    } else {
      query = `INSERT INTO ${collection} (${fieldsStr}) VALUES (${valuesStr})`;
    }

    let res = await request.query(query).catch(e => {
      this.error("(%s) happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    if (id !== undefined) {
      return res.recordset[0][0];
    }
  }

  async read(
    collection: string,
    fields: string[] = ["*"],
    criteria: { [key: string]: any } = {},
    opts: CNMSSqlReadOptions = {},
  ) {
    if (opts.format === undefined) opts.format = "json";
    if (opts.distinct === undefined) opts.distinct = false;
    if (opts.orderBy === undefined) opts.orderBy = [];
    if (opts.groupBy === undefined) opts.groupBy = [];
    if (opts.orderByDesc === undefined) opts.orderByDesc = [];

    let query = "";
    let request = new mssql.Request(this._pool);

    if (opts.format === "array") {
      request.arrayRowMode = true;
    }

    if (opts.distinct) {
      query = `SELECT DISTINCT ${fields.join()} FROM ${collection}`;
    } else {
      query = `SELECT ${fields.join()} FROM ${collection}`;
    }

    if (Object.keys(criteria).length > 0) {
      query += " WHERE ";

      let position = 1;
      for (const c in criteria) {
        if (position > 1) {
          query += " AND ";
        }

        const val = criteria[c];

        if (typeof val === "object") {
          request.input(c, val.val);
          query += `${c}${val.op}@${c}`;
          position++;
        } else {
          request.input(c, val);
          query += `${c}=@${c}`;
          position++;
        }
      }
    }

    if (opts.groupBy.length > 0) {
      query += ` GROUP BY ${opts.groupBy.join()}`;
    }
    if (opts.orderBy.length > 0) {
      query += ` ORDER BY ${opts.orderBy.join()}`;
      query += " ASC";
    }
    if (opts.orderByDesc.length > 0) {
      if (opts.orderBy.length > 0) {
        query += `, ${opts.orderByDesc.join()} DESC`;
      } else {
        query += ` ORDER BY ${opts.orderByDesc.join()} DESC`;
      }
    }

    let res = await request.query(query).catch(e => {
      // TODO: Improve error handling
      this.error("'%s' happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    if (opts.format === "array") {
      this.info("%j", res.columns[0]);
      let cols: string[] = [];
      for (let col in res.columns[0]) {
        cols.push(res.columns[0][col].name);
      }
      return [cols, ...res.recordset];
    }

    return res.recordset;
  }

  async update(
    collection: string,
    fields: { [key: string]: any },
    criteria: { [key: string]: any } = {},
  ) {
    let fieldStr = "";
    let position = 1;
    let request = new mssql.Request(this._pool);

    for (const f in fields) {
      if (position > 1) {
        fieldStr += ",";
      }

      request.input(f, fields[f]);
      fieldStr += `${f}=@${f}`;

      position++;
    }

    let query = `UPDATE ${collection} SET ${fieldStr}`;

    if (Object.keys(criteria).length > 0) {
      query += " WHERE ";

      let position = 1;
      for (const c in criteria) {
        if (position > 1) {
          query += " AND ";
        }

        const val = criteria[c];

        if (typeof val === "object") {
          request.input(c, val.val);
          query += `${c}${val.op}@${c}`;
          position++;
        } else {
          request.input(c, val);
          query += `${c}=@${c}`;
          position++;
        }
      }
    }

    let res = await request.query(query).catch(e => {
      // TODO: Improve error handling
      this.error("%s' happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    return res.rowsAffected[0];
  }

  async delete(collection: string, criteria: { [key: string]: any } = {}) {
    let query = `DELETE FROM ${collection}`;

    let request = new mssql.Request(this._pool);

    if (Object.keys(criteria).length > 0) {
      query += " WHERE ";

      let position = 1;
      for (const c in criteria) {
        if (position > 1) {
          query += " AND ";
        }

        const val = criteria[c];

        if (typeof val === "object") {
          request.input(c, val.val);
          query += `${c}${val.op}@${c}`;
          position++;
        } else {
          request.input(c, val);
          query += `${c}=@${c}`;
          position++;
        }
      }
    }

    let res = await request.query(query).catch(e => {
      // TODO: Improve error handling
      this.error("'%s' happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    return res.rowsAffected[0];
  }

  async query(query: string): Promise<any> {
    let request = new mssql.Request(this._pool);

    let res = await request.query(query).catch(e => {
      // TODO: Improve error handling
      this.error("'%s' happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    return res.recordset;
  }

  async exec(query: string): Promise<number> {
    let request = new mssql.Request(this._pool);

    let res = await request.query(query).catch(e => {
      // TODO: Improve error handling
      this.error("'%s' happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    return res.rowsAffected[0];
  }
}

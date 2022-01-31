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

export interface CNMSSqlCreateParams {
  collection: string;
  fields: { [key: string]: any };
  id?: string;
  transaction?: mssql.Transaction;
}

export interface CNMSSqlReadParams {
  collection: string;
  fields?: string[];
  criteria?: { [key: string]: any };
  opts?: CNMSSqlReadOptions;
  transaction?: mssql.Transaction;
}

export interface CNMSSqlUpdateParams {
  collection: string;
  fields: { [key: string]: any };
  criteria: { [key: string]: any };
  transaction?: mssql.Transaction;
}

export interface CNMSSqlDeleteParams {
  collection: string;
  criteria: { [key: string]: any };
  transaction?: mssql.Transaction;
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

  async create(params: CNMSSqlCreateParams): Promise<any> {
    let fieldsStr = "";
    let valuesStr = "";

    let request: mssql.Request;

    if (params.transaction !== undefined) {
      request = new mssql.Request(params.transaction);
    } else {
      request = new mssql.Request(this._pool);
    }

    let position = 1;
    for (const f in params.fields) {
      if (position > 1) {
        fieldsStr += ",";
        valuesStr += ",";
      }

      fieldsStr += f;
      valuesStr += `@${f}`;

      request.input(f, params.fields[f]);
      position++;
    }

    let query = "";

    if (params.id !== undefined) {
      query = `INSERT INTO ${params.collection} (${fieldsStr}) OUTPUT INSERTED.${params.id} VALUES (${valuesStr})`;
    } else {
      query = `INSERT INTO ${params.collection} (${fieldsStr}) VALUES (${valuesStr})`;
    }

    let res = await request.query(query).catch(e => {
      this.error("(%s) happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    if (params.id !== undefined) {
      return res.recordset[0][params.id];
    }
  }

  async read(params: CNMSSqlReadParams) {
    if (params.fields === undefined) params.fields = ["*"];
    if (params.criteria === undefined) params.criteria = {};
    if (params.opts === undefined) params.opts = {};

    if (params.opts.format === undefined) params.opts.format = "json";
    if (params.opts.distinct === undefined) params.opts.distinct = false;
    if (params.opts.orderBy === undefined) params.opts.orderBy = [];
    if (params.opts.groupBy === undefined) params.opts.groupBy = [];
    if (params.opts.orderByDesc === undefined) params.opts.orderByDesc = [];

    let query = "";
    let request: mssql.Request;

    if (params.transaction !== undefined) {
      request = new mssql.Request(params.transaction);
    } else {
      request = new mssql.Request(this._pool);
    }

    if (params.opts.format === "array") {
      request.arrayRowMode = true;
    }

    if (params.opts.distinct) {
      query = `SELECT DISTINCT ${params.fields.join()} FROM ${
        params.collection
      }`;
    } else {
      query = `SELECT ${params.fields.join()} FROM ${params.collection}`;
    }

    if (Object.keys(params.criteria).length > 0) {
      query += " WHERE ";

      let position = 1;
      for (const c in params.criteria) {
        if (position > 1) {
          query += " AND ";
        }

        const val = params.criteria[c];

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

    if (params.opts.groupBy.length > 0) {
      query += ` GROUP BY ${params.opts.groupBy.join()}`;
    }
    if (params.opts.orderBy.length > 0) {
      query += ` ORDER BY ${params.opts.orderBy.join()}`;
      query += " ASC";
    }
    if (params.opts.orderByDesc.length > 0) {
      if (params.opts.orderBy.length > 0) {
        query += `, ${params.opts.orderByDesc.join()} DESC`;
      } else {
        query += ` ORDER BY ${params.opts.orderByDesc.join()} DESC`;
      }
    }

    let res = await request.query(query).catch(e => {
      // TODO: Improve error handling
      this.error("'%s' happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    if (params.opts.format === "array") {
      this.info("%j", res.columns[0]);
      let cols: string[] = [];
      for (let col in res.columns[0]) {
        cols.push(res.columns[0][col].name);
      }
      return [cols, ...res.recordset];
    }

    return res.recordset;
  }

  async update(params: CNMSSqlUpdateParams) {
    let fieldStr = "";
    let position = 1;
    let request: mssql.Request;

    if (params.transaction !== undefined) {
      request = new mssql.Request(params.transaction);
    } else {
      request = new mssql.Request(this._pool);
    }

    for (const f in params.fields) {
      if (position > 1) {
        fieldStr += ",";
      }

      // Make sure the field param doesnt clash with a criteria param -
      // so add a "-__1" at the end of it and hope it doesn't clash!!
      request.input(`${f}__1`, params.fields[f]);
      fieldStr += `${f}=@${f}__1`;

      position++;
    }

    let query = `UPDATE ${params.collection} SET ${fieldStr}`;

    if (Object.keys(params.criteria).length > 0) {
      query += " WHERE ";

      let position = 1;
      for (const c in params.criteria) {
        if (position > 1) {
          query += " AND ";
        }

        const val = params.criteria[c];

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

  async delete(params: CNMSSqlDeleteParams) {
    let query = `DELETE FROM ${params.collection}`;

    let request: mssql.Request;

    if (params.transaction !== undefined) {
      request = new mssql.Request(params.transaction);
    } else {
      request = new mssql.Request(this._pool);
    }

    if (Object.keys(params.criteria).length > 0) {
      query += " WHERE ";

      let position = 1;
      for (const c in params.criteria) {
        if (position > 1) {
          query += " AND ";
        }

        const val = params.criteria[c];

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

  async query(query: string, transaction?: mssql.Transaction): Promise<any> {
    let request: mssql.Request;

    if (transaction !== undefined) {
      request = new mssql.Request(transaction);
    } else {
      request = new mssql.Request(this._pool);
    }

    let res = await request.query(query).catch(e => {
      // TODO: Improve error handling
      this.error("'%s' happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    return res.recordset;
  }

  async exec(query: string, transaction?: mssql.Transaction): Promise<number> {
    let request: mssql.Request;

    if (transaction !== undefined) {
      request = new mssql.Request(transaction);
    } else {
      request = new mssql.Request(this._pool);
    }

    let res = await request.query(query).catch(e => {
      // TODO: Improve error handling
      this.error("'%s' happened for query (%j)", e, query);
      throw new Error("Something wrong with your request!");
    });

    return res.rowsAffected[0];
  }

  async begin(): Promise<mssql.Transaction> {
    let transaction = new mssql.Transaction(this._pool);
    await transaction.begin();

    return transaction;
  }

  async commit(transaction: mssql.Transaction): Promise<void> {
    await transaction.commit();
  }

  async rollback(transaction: mssql.Transaction): Promise<void> {
    await transaction.rollback();
  }
}

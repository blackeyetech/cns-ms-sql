import { CNMSSql } from "./main";

process.env["CNA_MSSQL_USER"] = "SA";
process.env["CNA_MSSQL_PASSWORD"] = "Password1";
process.env["CNA_MSSQL_DB"] = "TempDB";
process.env["CNA_MSSQL_APP_NAME"] = "myApp";

async function run() {
  let mssql = new CNMSSql("MS-SQL");
  await mssql.init();

  let cols = await mssql.getTableColumns("test3").catch(e => {
    console.log("%j", e.message);
  });
  console.log(cols);

  let id = await mssql.create({
    collection: "test3",
    fields: { name: "", quantity: "5.123456789", d: "2021-01-01" },
    id: "id",
  });
  console.log(id);

  let rows = await mssql.read({ collection: "test3", criteria: { id } });
  console.log(rows);
}

run();

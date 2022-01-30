import { CNMSSql } from "./main";

process.env["CNA_MSSQL_USER"] = "SA";
process.env["CNA_MSSQL_PASSWORD"] = "Password1";
process.env["CNA_MSSQL_DB"] = "db";
process.env["CNA_MSSQL_APP_NAME"] = "myApp";

async function run() {
  let mssql = new CNMSSql("MS-SQL");
  await mssql.init();

  // let id = await mssql.create("Persons", { firstName: "Kieran" }, "Personid");

  // console.log(id);

  let rows = await mssql.delete(
    "Persons",

    {
      Personid: { val: 3, op: ">" },
    },
  );
  console.log(rows);
}

run();

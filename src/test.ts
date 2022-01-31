import { CNMSSql } from "./main";

process.env["CNA_MSSQL_USER"] = "SA";
process.env["CNA_MSSQL_PASSWORD"] = "Password1";
process.env["CNA_MSSQL_DB"] = "db";
process.env["CNA_MSSQL_APP_NAME"] = "myApp";

async function run() {
  let mssql = new CNMSSql("MS-SQL");
  await mssql.init();

  let id = await mssql.create({
    collection: "person",
    fields: { first: "James" },
    id: "id",
  });
  console.log(id);

  let rows = await mssql.read({ collection: "person" });
  console.log(rows);

  rows = await mssql.read({ collection: "person", criteria: { id } });
  console.log(rows);

  rows = await mssql.read({
    collection: "person",
    criteria: { first: "James" },
  });
  console.log(rows);

  await mssql.update({
    collection: "person",
    fields: {
      first: "Fred",
    },
    criteria: {
      id,
    },
  });

  rows = await mssql.read({ collection: "person", criteria: { id } });
  console.log(rows);

  await mssql.delete({
    collection: "person",

    criteria: {
      id,
    },
  });

  rows = await mssql.read({ collection: "person" });
  console.log(rows);
}

run();

import { CNMSSql } from "./main";

process.env["CNA_MSSQL_USER"] = "SA";
process.env["CNA_MSSQL_PASSWORD"] = "Password1";
process.env["CNA_MSSQL_DB"] = "TestDB";
process.env["CNA_MSSQL_APP_NAME"] = "myApp";

async function run() {
  let mssql = new CNMSSql("MS-SQL");
  await mssql.init();

  let cols = await mssql.getTableColumns("Inventory").catch(e => {
    console.log("%j", e.message);
  });
  console.log(cols);

  let id = await mssql.create({
    collection: "Inventory",
    fields: { id: 3, name: "fruit", quantity: "55.5" },
    id: "id",
  });
  console.log(id);

  let rows = await mssql.read({
    collection: "Inventory",
    criteria: {
      quantity: "500",
    },
  });
  console.log(rows);

  console.log("next");

  await mssql.update({
    collection: "Inventory",
    fields: {
      name: "veg",
      quantity: "500",
    },
    criteria: {
      id: 3,
    },
  });

  rows = await mssql.read({ collection: "Inventory", criteria: { id } });
  console.log(rows);
}

run();

#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { BizHubAgent, getConfig } from "@bizhub/agent-kit";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Table from "cli-table3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

const agent = new BizHubAgent({ name: "bizhub-cli", version: pkg.version });
agent.loadDefaultTools();

const program = new Command();

program
  .name("bizhub")
  .description(chalk.bold("BizHub Marketplace CLI") + chalk.dim(" — Enterprise management tool"))
  .version(pkg.version);

// ─── Config ───────────────────────────────────────────────────

program
  .command("config")
  .description("View or set CLI configuration")
  .option("--api-url <url>", "Set marketplace API URL")
  .option("--auth-cookie <token>", "Set auth cookie")
  .action((opts) => {
    if (opts.apiUrl || opts.authCookie) {
      const { writeFileSync, existsSync, mkdirSync } = require("node:fs");
      const { homedir } = require("node:os");
      const cfgPath = join(homedir(), ".bizhub", "config.json");
      if (!existsSync(join(homedir(), ".bizhub"))) {
        mkdirSync(join(homedir(), ".bizhub"), { recursive: true });
      }
      let cfg: Record<string, string> = {};
      try { cfg = JSON.parse(readFileSync(cfgPath, "utf-8")); } catch {}
      if (opts.apiUrl) cfg.apiUrl = opts.apiUrl;
      if (opts.authCookie) cfg.authCookie = opts.authCookie;
      writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
      console.log(chalk.green("✔"), "Configuration saved");
    } else {
      const cfg = getConfig();
      const table = new Table({ style: { head: [], border: [] } });
      table.push(
        [chalk.bold("API URL"), cfg.apiUrl],
        [chalk.bold("Auth"), cfg.authCookie ? chalk.green("configured") : chalk.red("not configured")],
        [chalk.bold("API Key"), cfg.apiKey || chalk.dim("not set")]
      );
      console.log(chalk.bold("\n  BizHub CLI Configuration\n"));
      console.log(table.toString());
      console.log(
        chalk.dim("\n  Set via: bizhub config --api-url <url> --auth-cookie <token>")
      );
      console.log(chalk.dim("  Or env:  BIZHUB_API_URL, BIZHUB_AUTH_COOKIE, BIZHUB_API_KEY\n"));
    }
  });

// ─── Products ─────────────────────────────────────────────────

const products = program.command("products").description("Manage products");

products
  .command("list")
  .description("List products with optional filters")
  .option("-c, --category <slug>", "Filter by category")
  .option("-s, --seller <id>", "Filter by seller")
  .option("--sort <field>", "Sort: newest|price_asc|price_desc")
  .option("-l, --limit <n>", "Max results", "50")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("products_list", opts);
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    printTable(
      ["Name", "Price", "Stock", "Status", "Category"],
      (result.data as any)?.products?.map((p: any) => [
        p.name?.slice(0, 30),
        chalk.green(`$${p.price?.toFixed(2)}`),
        p.inventory?.toString(),
        p.status === "ACTIVE" ? chalk.green("active") : chalk.yellow(p.status),
        p.category || "—",
      ]) || []
    );
  });

products
  .command("get <slug>")
  .description("Get product details")
  .option("--json", "JSON output")
  .action(async (slug, opts) => {
    const result = await agent.execute("products_get", { slug });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const p = result.data as any;
    console.log(chalk.bold(`\n  ${p.name}`));
    console.log(chalk.dim(`  ${p.description?.slice(0, 200)}`));
    printTable(
      ["Property", "Value"],
      [
        ["Price", chalk.green(`$${p.price?.toFixed(2)}`)],
        ["Stock", p.inventory?.toString() || "—"],
        ["Status", p.status === "ACTIVE" ? chalk.green("Active") : chalk.yellow(p.status)],
        ["Category", p.category?.name || "—"],
        ["Slug", p.slug || "—"],
        ["Views", p.views?.toLocaleString() || "0"],
      ]
    );
  });

products
  .command("create")
  .description("Create a new product")
  .requiredOption("-n, --name <name>", "Product name")
  .requiredOption("-d, --description <text>", "Description")
  .requiredOption("-p, --price <amount>", "Price")
  .requiredOption("-c, --category <id>", "Category ID")
  .option("--store <id>", "Store ID")
  .option("--stock <n>", "Stock count", "1")
  .option("--badge <type>", "Badge: hot|trending|sale|new")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("products_create", {
      name: opts.name,
      description: opts.description,
      price: parseFloat(opts.price),
      category: opts.category,
      store: opts.store,
      inventory: parseInt(opts.stock),
      badge: opts.badge,
    });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    console.log(chalk.green("✔"), `Product created: ${(result.data as any)?.name}`);
  });

products
  .command("update <slug>")
  .description("Update a product")
  .option("-p, --price <amount>", "New price")
  .option("--stock <n>", "New stock")
  .option("--status <status>", "ACTIVE or DRAFT")
  .option("--json", "JSON output")
  .action(async (slug, opts) => {
    const result = await agent.execute("products_update", { slug, ...opts });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    console.log(chalk.green("✔"), `Product updated: ${(result.data as any)?.name}`);
  });

products
  .command("delete <slug>")
  .description("Delete a product")
  .action(async (slug) => {
    const result = await agent.execute("products_delete", { slug });
    if (result.success) console.log(chalk.green("✔"), `Product deleted: ${slug}`);
    else console.error(chalk.red("✖"), result.error);
  });

// ─── Orders ───────────────────────────────────────────────────

const orders = program.command("orders").description("Manage orders");

orders
  .command("list")
  .description("List orders")
  .option("--status <status>", "Filter by status")
  .option("-l, --limit <n>", "Max results", "50")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("orders_list", opts);
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const d = result.data as any;
    printTable(
      ["ID", "Product", "Buyer", "Amount", "Status", "Date"],
      d?.orders?.map((o: any) => [
        chalk.dim(o.id?.slice(0, 8)),
        o.product?.name?.slice(0, 25) || "—",
        o.buyer?.name?.slice(0, 15) || "—",
        chalk.green(`$${o.amount?.toFixed(2)}`),
        statusColor(o.status),
        chalk.dim(new Date(o.createdAt).toLocaleDateString()),
      ]) || []
    );
  });

orders
  .command("get <id>")
  .description("Get order details")
  .option("--json", "JSON output")
  .action(async (id, opts) => {
    const result = await agent.execute("orders_get", { id });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const o = result.data as any;
    printTable(
      ["Property", "Value"],
      [
        ["Product", o.product?.name || "—"],
        ["Buyer", o.buyer?.name || "—"],
        ["Amount", chalk.green(`$${o.amount?.toFixed(2)}`)],
        ["Quantity", o.quantity?.toString() || "1"],
        ["Status", statusColor(o.status)],
        ["Date", chalk.dim(new Date(o.createdAt).toLocaleString())],
      ]
    );
  });

orders
  .command("update <id>")
  .description("Update order status")
  .requiredOption("-s, --status <status>", "pending|completed|refunded|cancelled")
  .option("--json", "JSON output")
  .action(async (id, opts) => {
    const result = await agent.execute("orders_update_status", { id, status: opts.status });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    console.log(chalk.green("✔"), `Order ${id.slice(0, 8)} → ${opts.status}`);
  });

// ─── Inventory ────────────────────────────────────────────────

const inventory = program.command("inventory").description("Manage inventory");

inventory
  .command("list")
  .description("List inventory levels")
  .option("-l, --low-stock", "Only low stock items (≤5)")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("inventory_list", { lowStock: opts.lowStock });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const d = result.data as any;
    console.log(chalk.dim(`\n  ${d.summary?.inStock || 0} in stock · ${d.summary?.lowStock || 0} low · ${d.summary?.outOfStock || 0} out of stock\n`));
    printTable(
      ["Product", "Stock", "Price", "Status"],
      d?.products?.map((p: any) => [
        p.name?.slice(0, 30),
        p.inventory === 0 ? chalk.red("OUT OF STOCK") : p.inventory <= 5 ? chalk.yellow(p.inventory.toString()) : chalk.green(p.inventory.toString()),
        chalk.green(`$${p.price?.toFixed(2)}`),
        p.status,
      ]) || []
    );
  });

inventory
  .command("update <slug>")
  .description("Update stock count")
  .requiredOption("-s, --stock <n>", "New stock count")
  .option("--json", "JSON output")
  .action(async (slug, opts) => {
    const result = await agent.execute("inventory_update", { slug, stock: parseInt(opts.stock) });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    console.log(chalk.green("✔"), `Inventory updated: ${slug} → ${opts.stock}`);
  });

// ─── Discounts ────────────────────────────────────────────────

const discounts = program.command("discounts").description("Manage discounts");

discounts
  .command("apply <slug>")
  .description("Apply % discount to a product")
  .requiredOption("-p, --percent <n>", "Discount percentage (1-99)")
  .option("--json", "JSON output")
  .action(async (slug, opts) => {
    const result = await agent.execute("discounts_apply", { slug, percent: parseFloat(opts.percent) });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const d = result.data as any;
    console.log(chalk.green("✔"), `${d.product}: $${d.originalPrice} → ${chalk.green(`$${d.salePrice}`)} (${d.percentOff}% OFF)`);
  });

discounts
  .command("remove <slug>")
  .description("Remove discount from a product")
  .option("--json", "JSON output")
  .action(async (slug, opts) => {
    const result = await agent.execute("discounts_remove", { slug });
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    console.log(chalk.green("✔"), `Discount removed from ${slug}`);
  });

discounts
  .command("list")
  .description("List active discounts")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("discounts_list", {});
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const d = result.data as any;
    if (!d?.discounts?.length) return console.log(chalk.dim("No active discounts"));
    for (const disc of d.discounts) {
      console.log(`  ${chalk.white(disc.name?.padEnd(35))} ${chalk.green(`$${disc.currentPrice?.toFixed(2)}`)} ${chalk.dim(`$${disc.originalPrice?.toFixed(2)}`)} ${chalk.green(`${disc.percentOff}% OFF`)}`);
    }
  });

// ─── Analytics ────────────────────────────────────────────────

program
  .command("analytics")
  .description("View store analytics")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("analytics_get", {});
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const a = result.data as any;
    console.log(chalk.bold("\n  Store Analytics\n"));
    printTable(
      ["Metric", "Value"],
      [
        ["Total Orders", chalk.white((a?.totalOrders || 0).toLocaleString())],
        ["Completed", chalk.green((a?.completedOrders || 0).toLocaleString())],
        ["Pending", chalk.yellow((a?.pendingOrders || 0).toLocaleString())],
        ["Revenue", chalk.green(`$${(a?.totalRevenue || 0).toFixed(2)}`)],
        ["Avg Order Value", chalk.cyan(`$${(a?.avgOrderValue || 0).toFixed(2)}`)],
        ["Unique Customers", chalk.white((a?.uniqueCustomers || 0).toLocaleString())],
      ]
    );
  });

// ─── Customers ────────────────────────────────────────────────

program
  .command("customers")
  .description("List customers")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("customers_list", {});
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const d = result.data as any;
    printTable(
      ["Name", "Email", "Orders", "Total Spent"],
      d?.customers?.map((c: any) => [
        c.name || "—",
        chalk.dim(c.email || "—"),
        c.orders?.toString() || "0",
        chalk.green(`$${c.totalSpent?.toFixed(2) || "0.00"}`),
      ]) || []
    );
  });

// ─── Categories & Stores ──────────────────────────────────────

program
  .command("categories")
  .description("List categories")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("categories_list", {});
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const items = result.data as any[];
    printTable(
      ["Name", "Slug"],
      items?.map((c: any) => [c.name, chalk.dim(c.slug)]) || []
    );
  });

program
  .command("stores")
  .description("List stores")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const result = await agent.execute("stores_list", {});
    if (opts.json) return console.log(JSON.stringify(result.data, null, 2));
    const items = result.data as any[];
    printTable(
      ["Name", "Rating", "Products", "Verified"],
      items?.map((s: any) => [
        s.name,
        s.rating ? chalk.yellow(`${s.rating.toFixed(1)} ★`) : "—",
        s._count?.products?.toString() || "—",
        s.isVerified ? chalk.green("✓") : chalk.dim("—"),
      ]) || []
    );
  });

program.parse();

// ─── Helpers ──────────────────────────────────────────────────

function printTable(headers: string[], rows: string[][]) {
  const table = new Table({
    head: headers.map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
    chars: {
      top: "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
      bottom: "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
      left: "│", "left-mid": "├", mid: "─", "mid-mid": "┼",
      right: "│", "right-mid": "┤", middle: "│",
    },
  });
  rows.forEach((row) => table.push(row));
  console.log(table.toString());
}

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: chalk.yellow("pending"),
    completed: chalk.green("completed"),
    refunded: chalk.red("refunded"),
    cancelled: chalk.gray("cancelled"),
  };
  return colors[status] || status;
}

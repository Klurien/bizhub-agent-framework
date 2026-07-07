#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

const program = new Command();

program
  .name("bizhub")
  .description(chalk.bold("BizHub Agent Framework") + chalk.dim(" — Manage your marketplace with AI"))
  .version(pkg.version);

// ─── Setup Wizard ────────────────────────────────────────────

import { setupCommand } from "./commands/setup.js";
program
  .command("setup")
  .description("Run the interactive setup wizard")
  .action(setupCommand);

// ─── Service Management ─────────────────────────────────────

import { startCommand, stopCommand, statusCommand, restartCommand, logsCommand } from "./commands/service.js";

program
  .command("start [service]")
  .description("Start services (marketplace, mcp, turn, or all)")
  .action(async (service?: string) => {
    await startCommand(service);
  });

program
  .command("stop [service]")
  .description("Stop services")
  .action(async (service?: string) => {
    await stopCommand(service);
  });

program
  .command("restart [service]")
  .description("Restart services")
  .action(async (service?: string) => {
    await restartCommand(service);
  });

program
  .command("status")
  .description("Show service status")
  .action(statusCommand);

program
  .command("logs [service]")
  .description("View service logs")
  .option("-f, --follow", "Tail logs in real-time")
  .action(async (service?: string, opts?: { follow?: boolean }) => {
    await logsCommand(service, opts?.follow);
  });

// ─── Marketplace Commands (from agent-kit) ──────────────────

import { BizHubAgent, getConfig } from "@biz-hub/agent-kit";
import Table from "cli-table3";

const agent = new BizHubAgent({ name: "bizhub-cli", version: pkg.version });
agent.loadDefaultTools();

function statusColor(s: string): string {
  const c: Record<string, string> = { pending: chalk.yellow("pending"), completed: chalk.green("completed"), refunded: chalk.red("refunded"), cancelled: chalk.gray("cancelled") };
  return c[s] || s;
}

function printTable(headers: string[], rows: string[][]) {
  const t = new Table({
    head: headers.map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
    chars: { top: "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐", bottom: "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘", left: "│", "left-mid": "├", mid: "─", "mid-mid": "┼", right: "│", "right-mid": "┤", middle: "│" },
  });
  rows.forEach((r) => t.push(r));
  console.log(t.toString());
}

const products = program.command("products").description("Manage products");

products.command("list").description("List products").option("-c, --category <slug>", "Filter by category").option("--sort <field>", "Sort order").option("-l, --limit <n>", "Max results", "50").option("--json", "JSON output").action(async (o) => {
  const r = await agent.execute("products_list", o);
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  printTable(["Name", "Price", "Stock", "Status", "Category"], (r.data as any)?.products?.map((p: any) => [p.name?.slice(0, 30), chalk.green(`$${p.price?.toFixed(2)}`), p.inventory?.toString(), p.status === "ACTIVE" ? chalk.green("active") : chalk.yellow(p.status), p.category || "—"]) || []);
});

products.command("get <slug>").description("Get product details").option("--json", "JSON output").action(async (slug, o) => {
  const r = await agent.execute("products_get", { slug });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  const p = r.data as any;
  console.log(chalk.bold(`\n  ${p.name}`), chalk.dim(`  ${p.description?.slice(0, 200)}`));
  printTable(["Property", "Value"], [["Price", chalk.green(`$${p.price?.toFixed(2)}`)], ["Stock", p.inventory?.toString() || "—"], ["Status", p.status === "ACTIVE" ? chalk.green("Active") : chalk.yellow(p.status)], ["Category", p.category?.name || "—"], ["Slug", p.slug], ["Views", p.views?.toLocaleString() || "0"]]);
});

products.command("create").description("Create a product").requiredOption("-n, --name <name>").requiredOption("-d, --description <text>").requiredOption("-p, --price <amount>").requiredOption("-c, --category <id>").option("--store <id>").option("--stock <n>", "Stock count", "1").option("--badge <type>").option("--json", "JSON output").action(async (o) => {
  const r = await agent.execute("products_create", { name: o.name, description: o.description, price: parseFloat(o.price), category: o.category, store: o.store, inventory: parseInt(o.stock), badge: o.badge });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  console.log(chalk.green("✔"), `Product created: ${(r.data as any)?.name}`);
});

products.command("update <slug>").description("Update a product").option("-p, --price <amount>").option("--stock <n>").option("--status <status>").option("--json", "JSON output").action(async (slug, o) => {
  const r = await agent.execute("products_update", { slug, ...o });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  console.log(chalk.green("✔"), `Product updated: ${(r.data as any)?.name}`);
});

products.command("delete <slug>").description("Delete a product").action(async (slug) => {
  const r = await agent.execute("products_delete", { slug });
  r.success ? console.log(chalk.green("✔"), `Deleted: ${slug}`) : console.error(chalk.red("✖"), r.error);
});

const orders = program.command("orders").description("Manage orders");

orders.command("list").description("List orders").option("--status <status>").option("-l, --limit <n>", "50").option("--json", "JSON output").action(async (o) => {
  const r = await agent.execute("orders_list", o);
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  printTable(["ID", "Product", "Buyer", "Amount", "Status", "Date"], (r.data as any)?.orders?.map((o: any) => [chalk.dim(o.id?.slice(0, 8)), o.product?.name?.slice(0, 25) || "—", o.buyer?.name?.slice(0, 15) || "—", chalk.green(`$${o.amount?.toFixed(2)}`), statusColor(o.status), chalk.dim(new Date(o.createdAt).toLocaleDateString())]) || []);
});

orders.command("get <id>").description("Get order details").option("--json", "JSON output").action(async (id, o) => {
  const r = await agent.execute("orders_get", { id });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  const od = r.data as any;
  printTable(["Property", "Value"], [["Product", od.product?.name || "—"], ["Buyer", od.buyer?.name || "—"], ["Amount", chalk.green(`$${od.amount?.toFixed(2)}`)], ["Quantity", od.quantity?.toString() || "1"], ["Status", statusColor(od.status)], ["Date", chalk.dim(new Date(od.createdAt).toLocaleString())]]);
});

orders.command("update <id>").description("Update order status").requiredOption("-s, --status <status>").option("--json", "JSON output").action(async (id, o) => {
  const r = await agent.execute("orders_update_status", { id, status: o.status });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  console.log(chalk.green("✔"), `Order ${id.slice(0, 8)} → ${o.status}`);
});

const inventory = program.command("inventory").description("Manage inventory");

inventory.command("list").description("List inventory").option("-l, --low-stock", "Only low stock").option("--json", "JSON output").action(async (o) => {
  const r = await agent.execute("inventory_list", { lowStock: o.lowStock });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  const d = r.data as any;
  console.log(chalk.dim(`\n  ${d.summary?.inStock || 0} in stock · ${d.summary?.lowStock || 0} low · ${d.summary?.outOfStock || 0} out of stock\n`));
  printTable(["Product", "Stock", "Price", "Status"], d?.products?.map((p: any) => [p.name?.slice(0, 30), p.inventory === 0 ? chalk.red("OUT OF STOCK") : p.inventory <= 5 ? chalk.yellow(p.inventory.toString()) : chalk.green(p.inventory.toString()), chalk.green(`$${p.price?.toFixed(2)}`), p.status]) || []);
});

inventory.command("update <slug>").description("Update stock").requiredOption("-s, --stock <n>").option("--json").action(async (slug, o) => {
  const r = await agent.execute("inventory_update", { slug, stock: parseInt(o.stock) });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  console.log(chalk.green("✔"), `Stock updated: ${slug} → ${o.stock}`);
});

const discounts = program.command("discounts").description("Manage discounts");

discounts.command("apply <slug>").description("Apply % discount").requiredOption("-p, --percent <n>").option("--json").action(async (slug, o) => {
  const r = await agent.execute("discounts_apply", { slug, percent: parseFloat(o.percent) });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  const d = r.data as any;
  console.log(chalk.green("✔"), `${d.product}: $${d.originalPrice} → ${chalk.green(`$${d.salePrice}`)} (${d.percentOff}% OFF)`);
});

discounts.command("remove <slug>").description("Remove discount").option("--json").action(async (slug, o) => {
  const r = await agent.execute("discounts_remove", { slug });
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  console.log(chalk.green("✔"), `Discount removed from ${slug}`);
});

discounts.command("list").description("List active discounts").option("--json").action(async (o) => {
  const r = await agent.execute("discounts_list", {});
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  const d = r.data as any;
  if (!d?.discounts?.length) return console.log(chalk.dim("No active discounts"));
  for (const disc of d.discounts) console.log(`  ${chalk.white(disc.name?.padEnd(35))} ${chalk.green(`$${disc.currentPrice?.toFixed(2)}`)} ${chalk.dim(`$${disc.originalPrice?.toFixed(2)}`)} ${chalk.green(`${disc.percentOff}% OFF`)}`);
});

program.command("analytics").description("View store analytics").option("--json").action(async (o) => {
  const r = await agent.execute("analytics_get", {});
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  const a = r.data as any;
  console.log(chalk.bold("\n  Store Analytics\n"));
  printTable(["Metric", "Value"], [["Total Orders", chalk.white((a?.totalOrders || 0).toLocaleString())], ["Completed", chalk.green((a?.completedOrders || 0).toLocaleString())], ["Pending", chalk.yellow((a?.pendingOrders || 0).toLocaleString())], ["Revenue", chalk.green(`$${(a?.totalRevenue || 0).toFixed(2)}`)], ["Avg Order Value", chalk.cyan(`$${(a?.avgOrderValue || 0).toFixed(2)}`)], ["Unique Customers", chalk.white((a?.uniqueCustomers || 0).toLocaleString())]]);
});

program.command("customers").description("List customers").option("--json").action(async (o) => {
  const r = await agent.execute("customers_list", {});
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  printTable(["Name", "Email", "Orders", "Total Spent"], (r.data as any)?.customers?.map((c: any) => [c.name || "—", chalk.dim(c.email || "—"), c.orders?.toString() || "0", chalk.green(`$${c.totalSpent?.toFixed(2) || "0.00"}`)]) || []);
});

program.command("categories").description("List categories").option("--json").action(async (o) => {
  const r = await agent.execute("categories_list", {});
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  printTable(["Name", "Slug"], ((r.data as any[]) || []).map((c: any) => [c.name, chalk.dim(c.slug)]));
});

program.command("stores").description("List stores").option("--json").action(async (o) => {
  const r = await agent.execute("stores_list", {});
  if (o.json) return console.log(JSON.stringify(r.data, null, 2));
  printTable(["Name", "Rating", "Products", "Verified"], ((r.data as any[]) || []).map((s: any) => [s.name, s.rating ? chalk.yellow(`${s.rating.toFixed(1)} ★`) : "—", s._count?.products?.toString() || "—", s.isVerified ? chalk.green("✓") : chalk.dim("—")]));
});

// ─── Dashboard ──────────────────────────────────────────────

program
  .command("dashboard")
  .description("Open the admin dashboard in your browser")
  .action(() => {
    const cfg = getConfig();
    const url = cfg.apiUrl?.replace(/\/api\/?$/, "") || "http://localhost:3001";
    const panelUrl = `${url}/panel`;
    console.log(chalk.cyan("  → Opening"), chalk.white(panelUrl));
    try {
      execSync(`xdg-open "${panelUrl}"`, { stdio: "ignore" });
    } catch {
      console.log(chalk.yellow("  ⚠ Could not open browser. Visit:"), chalk.cyan(panelUrl));
    }
  });

// ─── Config ─────────────────────────────────────────────────

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

program.command("config").description("View or set configuration").option("--api-url <url>").option("--auth-cookie <token>").option("--api-key <key>").action((o) => {
  const cfgPath = join(homedir(), ".bizhub", "config.json");
  if (o.apiUrl || o.authCookie || o.apiKey) {
    if (!existsSync(join(homedir(), ".bizhub"))) mkdirSync(join(homedir(), ".bizhub"), { recursive: true });
    let cfg: Record<string, string> = {};
    try { cfg = JSON.parse(readFileSync(cfgPath, "utf-8")); } catch {}
    if (o.apiUrl) cfg.apiUrl = o.apiUrl;
    if (o.authCookie) cfg.authCookie = o.authCookie;
    if (o.apiKey) cfg.apiKey = o.apiKey;
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    console.log(chalk.green("✔"), "Configuration saved");
  } else {
    const cfg = getConfig();
    printTable(["Setting", "Value"], [["API URL", cfg.apiUrl], ["Auth", cfg.authCookie ? chalk.green("cookie set") : cfg.apiKey ? chalk.green("API key set") : chalk.red("not set")]]);
  }
});

program.parse();

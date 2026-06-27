import csv
import json
import os
import sys
import math
from collections import defaultdict, Counter
from datetime import datetime, timedelta

# File paths
csv_path = r"c:\Users\DTC\Desktop\O2 store dashboard for test\Demo Candidate Dataset.csv"
output_dir = r"c:\Users\DTC\Desktop\O2 store dashboard for test\data"

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

print(f"Reading dataset: {csv_path}")
print(f"Output directory: {output_dir}")

def parse_date(date_str):
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    try:
        # Fallback to prefix
        return datetime.strptime(date_str[:10], "%Y-%m-%d")
    except Exception:
        return None

def analyze():
    # Primary storage maps
    sku_stats = defaultdict(lambda: {
        "sku": "", "name": "", "category": "", "group": "",
        "price": 0.0, "issued_qty": 0.0, "grn_qty": 0.0,
        "issued_val": 0.0, "grn_val": 0.0, "tx_count": 0,
        "returns_count": 0, "returns_qty": 0.0, "reusable": 0, "returnable": 0,
        "recent_issued_qty": 0.0, "recent_issued_val": 0.0 # Last 30 days of the dataset (Jan 2026)
    })
    
    category_stats = defaultdict(lambda: {
        "category": "", "issued_qty": 0.0, "grn_qty": 0.0,
        "issued_val": 0.0, "grn_val": 0.0, "tx_count": 0,
        "returns_qty": 0.0, "returns_count": 0,
        "skus": set()
    })
    
    group_stats = defaultdict(lambda: {
        "group": "", "issued_qty": 0.0, "issued_val": 0.0, "tx_count": 0
    })

    location_stats = defaultdict(lambda: {
        "location_id": "", "issued_qty": 0.0, "grn_qty": 0.0,
        "issued_val": 0.0, "grn_val": 0.0, "tx_count": 0,
        "categories": defaultdict(float), "lines": set()
    })

    line_stats = defaultdict(lambda: {
        "line_name": "", "issued_qty": 0.0, "issued_val": 0.0, "tx_count": 0,
        "categories": defaultdict(float), "assets": defaultdict(float),
        "weekly_consumption": defaultdict(float) # key: week_start_str
    })

    asset_stats = defaultdict(lambda: {
        "asset_name": "", "issued_qty": 0.0, "issued_val": 0.0, "tx_count": 0,
        "lines": set()
    })

    # Time series
    daily_trends = defaultdict(lambda: {
        "date": "", "tx_count": 0, "issued_qty": 0.0, "grn_qty": 0.0,
        "issued_val": 0.0, "grn_val": 0.0, "returned_qty": 0.0
    })

    weekly_trends = defaultdict(lambda: {
        "week": "", "tx_count": 0, "issued_qty": 0.0, "grn_qty": 0.0,
        "issued_val": 0.0, "grn_val": 0.0, "returned_qty": 0.0
    })

    monthly_trends = defaultdict(lambda: {
        "month": "", "tx_count": 0, "issued_qty": 0.0, "grn_qty": 0.0,
        "issued_val": 0.0, "grn_val": 0.0, "returned_qty": 0.0
    })

    # Order reason counters
    order_reasons = Counter()
    order_reason_qty = defaultdict(float)
    order_reason_val = defaultdict(float)

    # General KPIs
    total_tx = 0
    reusable_tx_count = 0
    reusable_saving_val = 0.0
    
    # We first find the dataset date range, or we can use a fixed definition of recent (e.g. Jan 2026)
    # The max date in dataset was 2026-01-31.
    recent_threshold = datetime(2026, 1, 1)

    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        
        for idx, row in enumerate(reader):
            if len(row) < 25:
                row += [""] * (25 - len(row))
            
            time_str = row[0].strip()
            tx_type = row[1].strip()
            tx_status = row[2].strip()
            sku = row[3].strip()
            name = row[4].strip()
            cat = row[6].strip()
            group = row[7].strip()
            qty_str = row[8].strip()
            returnable_str = row[9].strip()
            price_str = row[10].strip()
            subtotal_str = row[12].strip()
            grn_val_str = row[13].strip()
            issued_val_str = row[14].strip()
            order_reason = row[16].strip()
            location = row[17].strip()
            source_location = row[18].strip()
            line = row[19].strip()
            asset = row[20].strip()
            reusable_str = row[24].strip()
            
            if not sku:
                continue
                
            total_tx += 1
            if reusable_str == "1":
                reusable_tx_count += 1

            # Parse numbers
            qty = 0.0
            try: qty = float(qty_str) if qty_str else 0.0
            except ValueError: pass
            
            price = 0.0
            try: price = float(price_str) if price_str else 0.0
            except ValueError: pass
            
            grn_val = 0.0
            try: grn_val = float(grn_val_str) if grn_val_str else 0.0
            except ValueError: pass

            issued_val = 0.0
            try: issued_val = float(issued_val_str) if issued_val_str else 0.0
            except ValueError: pass

            # Fallback for value calculations if the columns are blank but price/qty are present
            if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                if issued_val == 0.0 and price > 0 and qty > 0:
                    issued_val = price * qty
            elif tx_type in ("GRN", "Purchase"):
                if grn_val == 0.0 and price > 0 and qty > 0:
                    grn_val = price * qty

            reusable = 1 if reusable_str == "1" else 0
            returnable = 1 if returnable_str and returnable_str != "0" else 0

            if reusable == 1 and tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                reusable_saving_val += issued_val

            # Date formatting
            dt = parse_date(time_str)
            date_key = ""
            week_key = ""
            month_key = ""
            is_recent = False
            
            if dt:
                date_key = dt.strftime("%Y-%m-%d")
                week_start = dt - timedelta(days=dt.weekday())
                week_key = week_start.strftime("%Y-%m-%d")
                month_key = dt.strftime("%Y-%m")
                if dt >= recent_threshold:
                    is_recent = True

            # Update SKU metrics
            s = sku_stats[sku]
            s["sku"] = sku
            s["name"] = name
            s["category"] = cat
            s["group"] = group
            if price > 0:
                s["price"] = price
            s["tx_count"] += 1
            s["reusable"] = reusable
            s["returnable"] = returnable
            
            if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                s["issued_qty"] += qty
                s["issued_val"] += issued_val
                if is_recent:
                    s["recent_issued_qty"] += qty
                    s["recent_issued_val"] += issued_val
            elif tx_type == "Transaction Return":
                s["returns_count"] += 1
                s["returns_qty"] += qty
            elif tx_type in ("GRN", "Purchase"):
                s["grn_qty"] += qty
                s["grn_val"] += grn_val

            # Update Category
            c = category_stats[cat]
            c["category"] = cat
            c["tx_count"] += 1
            c["skus"].add(sku)
            if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                c["issued_qty"] += qty
                c["issued_val"] += issued_val
            elif tx_type == "Transaction Return":
                c["returns_qty"] += qty
                c["returns_count"] += 1
            elif tx_type in ("GRN", "Purchase"):
                c["grn_qty"] += qty
                c["grn_val"] += grn_val

            # Update Group
            g = group_stats[group]
            g["group"] = group
            g["tx_count"] += 1
            if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                g["issued_qty"] += qty
                g["issued_val"] += issued_val

            # Update Location
            if location:
                l = location_stats[location]
                l["location_id"] = location
                l["tx_count"] += 1
                if line:
                    l["lines"].add(line)
                if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                    l["issued_qty"] += qty
                    l["issued_val"] += issued_val
                    l["categories"][cat] += issued_val
                elif tx_type in ("GRN", "Purchase"):
                    l["grn_qty"] += qty
                    l["grn_val"] += grn_val

            # Update Line
            if line:
                ln = line_stats[line]
                ln["line_name"] = line
                ln["tx_count"] += 1
                if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                    ln["issued_qty"] += qty
                    ln["issued_val"] += issued_val
                    ln["categories"][cat] += issued_val
                    if asset:
                        ln["assets"][asset] += issued_val
                    if week_key:
                        ln["weekly_consumption"][week_key] += issued_val

            # Update Asset
            if asset:
                ast = asset_stats[asset]
                ast["asset_name"] = asset
                ast["tx_count"] += 1
                if line:
                    ast["lines"].add(line)
                if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                    ast["issued_qty"] += qty
                    ast["issued_val"] += issued_val

            # Update Trends
            if date_key:
                d_t = daily_trends[date_key]
                d_t["date"] = date_key
                d_t["tx_count"] += 1
                if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                    d_t["issued_qty"] += qty
                    d_t["issued_val"] += issued_val
                elif tx_type in ("GRN", "Purchase"):
                    d_t["grn_qty"] += qty
                    d_t["grn_val"] += grn_val
                elif tx_type == "Transaction Return":
                    d_t["returned_qty"] += qty

            if week_key:
                w_t = weekly_trends[week_key]
                w_t["week"] = week_key
                w_t["tx_count"] += 1
                if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                    w_t["issued_qty"] += qty
                    w_t["issued_val"] += issued_val
                elif tx_type in ("GRN", "Purchase"):
                    w_t["grn_qty"] += qty
                    w_t["grn_val"] += grn_val
                elif tx_type == "Transaction Return":
                    w_t["returned_qty"] += qty

            if month_key:
                m_t = monthly_trends[month_key]
                m_t["month"] = month_key
                m_t["tx_count"] += 1
                if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                    m_t["issued_qty"] += qty
                    m_t["issued_val"] += issued_val
                elif tx_type in ("GRN", "Purchase"):
                    m_t["grn_qty"] += qty
                    m_t["grn_val"] += grn_val
                elif tx_type == "Transaction Return":
                    m_t["returned_qty"] += qty

            # Order Reason
            if tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                reason = order_reason if order_reason else "Unspecified"
                order_reasons[reason] += 1
                order_reason_qty[reason] += qty
                order_reason_val[reason] += issued_val

    print("Data loading complete. Running advanced analytics...")

    # 1. ABC Classification
    total_issued_val_all = sum(s["issued_val"] for s in sku_stats.values())
    sorted_skus = sorted(sku_stats.values(), key=lambda x: x["issued_val"], reverse=True)
    
    cumulative_val = 0.0
    a_skus, b_skus, c_skus = 0, 0, 0
    for s in sorted_skus:
        cumulative_val += s["issued_val"]
        pct = (cumulative_val / total_issued_val_all) * 100 if total_issued_val_all > 0 else 100
        if pct <= 70.0:
            s["abc_class"] = "A"
            a_skus += 1
        elif pct <= 90.0:
            s["abc_class"] = "B"
            b_skus += 1
        else:
            s["abc_class"] = "C"
            c_skus += 1

    # 2. Stockout Risk Identification
    stockout_risks = []
    for s in sorted_skus:
        if s["issued_val"] > 0 and s["grn_val"] == 0:
            if s["abc_class"] in ("A", "B") or s["recent_issued_qty"] > 30:
                stockout_risks.append({
                    "sku": s["sku"],
                    "name": s["name"],
                    "category": s["category"],
                    "abc_class": s["abc_class"],
                    "total_issued_qty": s["issued_qty"],
                    "total_issued_val": round(s["issued_val"], 2),
                    "recent_issued_qty": s["recent_issued_qty"],
                    "price": s["price"]
                })
    
    stockout_risks = sorted(stockout_risks, key=lambda x: x["total_issued_val"], reverse=True)[:50]

    # 3. Weekly Anomalies Detection by Line
    anomalies = []
    for line_name, data in line_stats.items():
        weekly_vals = list(data["weekly_consumption"].values())
        if len(weekly_vals) < 4:
            continue
        
        mean_val = sum(weekly_vals) / len(weekly_vals)
        variance = sum((x - mean_val) ** 2 for x in weekly_vals) / len(weekly_vals)
        sd_val = math.sqrt(variance)
        
        if sd_val == 0:
            continue
            
        for week_start_str, actual_val in data["weekly_consumption"].items():
            z_score = (actual_val - mean_val) / sd_val
            if z_score > 2.2:
                anomalies.append({
                    "line_name": line_name,
                    "week_start": week_start_str,
                    "actual_value": round(actual_val, 2),
                    "expected_mean": round(mean_val, 2),
                    "z_score": round(z_score, 2),
                    "deviation_pct": round(((actual_val - mean_val) / mean_val) * 100, 1) if mean_val > 0 else 0
                })
    
    anomalies = sorted(anomalies, key=lambda x: x["z_score"], reverse=True)

    # 4. Needle Forecast (Category NEED)
    weekly_needles = defaultdict(float)
    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if len(row) < 25:
                row += [""] * (25 - len(row))
            time_str = row[0].strip()
            cat = row[6].strip()
            qty_str = row[8].strip()
            tx_type = row[1].strip()
            
            if cat == "NEED" and tx_type in ("Transaction Issue", "Transaction Change", "Consumable", "Components"):
                dt = parse_date(time_str)
                if dt:
                    week_start = dt - timedelta(days=dt.weekday())
                    week_key = week_start.strftime("%Y-%m-%d")
                    try:
                        qty = float(qty_str) if qty_str else 0.0
                        weekly_needles[week_key] += qty
                    except ValueError:
                        pass
                        
    sorted_weeks = sorted(weekly_needles.keys())
    needle_weekly_vals = [weekly_needles[w] for w in sorted_weeks]
    
    forecast_results = []
    if len(needle_weekly_vals) >= 6:
        ma_4 = sum(needle_weekly_vals[-4:]) / 4
        half = len(needle_weekly_vals) // 2
        first_half_avg = sum(needle_weekly_vals[:half]) / half
        second_half_avg = sum(needle_weekly_vals[half:]) / half
        trend = (second_half_avg - first_half_avg) / half
        
        last_date = datetime.strptime(sorted_weeks[-1], "%Y-%m-%d")
        for i in range(1, 5):
            proj_date = last_date + timedelta(weeks=i)
            proj_week = proj_date.strftime("%Y-%m-%d")
            proj_val = max(0.0, ma_4 + trend * i)
            forecast_results.append({
                "week": proj_week,
                "projected_qty": round(proj_val, 1)
            })
    
    # Save Summary KPIs
    total_grn_val_all = sum(s["grn_val"] for s in sku_stats.values())
    total_qty_issued_all = sum(s["issued_qty"] for s in sku_stats.values())
    total_qty_received_all = sum(s["grn_qty"] for s in sku_stats.values())
    total_returns_qty_all = sum(s["returns_qty"] for s in sku_stats.values())
    
    summary_data = {
        "kpis": {
            "total_transactions": total_tx,
            "total_qty_issued": total_qty_issued_all,
            "total_qty_received": total_qty_received_all,
            "total_qty_returned": total_returns_qty_all,
            "total_issued_value": round(total_issued_val_all, 2),
            "total_grn_value": round(total_grn_val_all, 2),
            "net_inventory_flow": round(total_grn_val_all - total_issued_val_all, 2),
            "active_skus": len(sku_stats),
            "active_locations": len(location_stats),
            "active_categories": len(category_stats),
            "active_assets": len(asset_stats),
            "active_lines": len(line_stats),
            "reusable_transactions_count": reusable_tx_count,
            "reusable_transactions_pct": round((reusable_tx_count / total_tx) * 100, 2) if total_tx > 0 else 0,
            "reusable_savings_value": round(reusable_saving_val, 2)
        },
        "top_categories_by_value": sorted(
            [{"category": c, "value": round(d["issued_val"], 2), "qty": d["issued_qty"]} for c, d in category_stats.items()],
            key=lambda x: x["value"], reverse=True
        )[:10],
        "top_locations_by_value": sorted(
            [{"location_id": l, "value": round(d["issued_val"], 2), "qty": d["issued_qty"]} for l, d in location_stats.items()],
            key=lambda x: x["value"], reverse=True
        )[:10]
    }
    
    with open(os.path.join(output_dir, "summary.json"), "w", encoding="utf-8") as out:
        json.dump(summary_data, out, indent=2)

    # Save Trends
    trends_data = {
        "daily": sorted(list(daily_trends.values()), key=lambda x: x["date"]),
        "weekly": sorted(list(weekly_trends.values()), key=lambda x: x["week"]),
        "monthly": sorted(list(monthly_trends.values()), key=lambda x: x["month"]),
        "needle_forecast": forecast_results,
        "needle_history": [{"week": w, "qty": q} for w, q in sorted(weekly_needles.items())]
    }
    with open(os.path.join(output_dir, "trends.json"), "w", encoding="utf-8") as out:
        json.dump(trends_data, out, indent=2)

    # Save Categories & Groups
    categories_list = []
    for cat, data in category_stats.items():
        categories_list.append({
            "category": cat,
            "issued_qty": data["issued_qty"],
            "grn_qty": data["grn_qty"],
            "issued_val": round(data["issued_val"], 2),
            "grn_val": round(data["grn_val"], 2),
            "tx_count": data["tx_count"],
            "returns_qty": data["returns_qty"],
            "returns_count": data["returns_count"],
            "return_rate_pct": round((data["returns_qty"] / data["issued_qty"]) * 100, 2) if data["issued_qty"] > 0 else 0,
            "unique_skus_count": len(data["skus"])
        })
    categories_list = sorted(categories_list, key=lambda x: x["issued_val"], reverse=True)
    
    groups_list = []
    for grp, data in group_stats.items():
        groups_list.append({
            "group": grp if grp else "Unspecified",
            "issued_qty": data["issued_qty"],
            "issued_val": round(data["issued_val"], 2),
            "tx_count": data["tx_count"]
        })
    groups_list = sorted(groups_list, key=lambda x: x["issued_val"], reverse=True)
    
    with open(os.path.join(output_dir, "categories.json"), "w", encoding="utf-8") as out:
        json.dump({"categories": categories_list, "groups": groups_list}, out, indent=2)

    # Save Locations & Lines
    locations_list = []
    for loc, data in location_stats.items():
        main_cat = "None"
        main_cat_val = 0.0
        for c, val in data["categories"].items():
            if val > main_cat_val:
                main_cat = c
                main_cat_val = val
        locations_list.append({
            "location_id": loc,
            "issued_qty": data["issued_qty"],
            "grn_qty": data["grn_qty"],
            "issued_val": round(data["issued_val"], 2),
            "grn_val": round(data["grn_val"], 2),
            "tx_count": data["tx_count"],
            "lines_count": len(data["lines"]),
            "main_category": main_cat,
            "main_category_value": round(main_cat_val, 2)
        })
    locations_list = sorted(locations_list, key=lambda x: x["issued_val"], reverse=True)

    lines_list = []
    for line, data in line_stats.items():
        main_cat = "None"
        main_cat_val = 0.0
        for c, val in data["categories"].items():
            if val > main_cat_val:
                main_cat = c
                main_cat_val = val
        
        main_asset = "None"
        main_asset_val = 0.0
        for a, val in data["assets"].items():
            if val > main_asset_val:
                main_asset = a
                main_asset_val = val

        lines_list.append({
            "line_name": line,
            "issued_qty": data["issued_qty"],
            "issued_val": round(data["issued_val"], 2),
            "tx_count": data["tx_count"],
            "main_category": main_cat,
            "main_category_value": round(main_cat_val, 2),
            "main_asset": main_asset,
            "main_asset_value": round(main_asset_val, 2)
        })
    lines_list = sorted(lines_list, key=lambda x: x["issued_val"], reverse=True)

    assets_list = []
    for asset, data in asset_stats.items():
        assets_list.append({
            "asset_name": asset,
            "issued_qty": data["issued_qty"],
            "issued_val": round(data["issued_val"], 2),
            "tx_count": data["tx_count"],
            "lines_count": len(data["lines"])
        })
    assets_list = sorted(assets_list, key=lambda x: x["issued_val"], reverse=True)

    with open(os.path.join(output_dir, "locations.json"), "w", encoding="utf-8") as out:
        json.dump({
            "locations": locations_list,
            "lines": lines_list,
            "assets": assets_list
        }, out, indent=2)

    # Save SKUs
    top_skus_list = []
    other_tx_count = 0
    other_issued_qty = 0.0
    other_issued_val = 0.0
    other_grn_qty = 0.0
    other_grn_val = 0.0
    other_returns_qty = 0.0
    other_returns_count = 0
    
    for idx, s in enumerate(sorted_skus):
        sku_entry = {
            "sku": s["sku"],
            "name": s["name"],
            "category": s["category"],
            "group": s["group"],
            "price": round(s["price"], 2),
            "issued_qty": s["issued_qty"],
            "grn_qty": s["grn_qty"],
            "issued_val": round(s["issued_val"], 2),
            "grn_val": round(s["grn_val"], 2),
            "tx_count": s["tx_count"],
            "returns_qty": s["returns_qty"],
            "returns_count": s["returns_count"],
            "return_rate_pct": round((s["returns_qty"] / s["issued_qty"]) * 100, 2) if s["issued_qty"] > 0 else 0,
            "reusable": s["reusable"],
            "returnable": s["returnable"],
            "abc_class": s["abc_class"]
        }
        
        if idx < 1500:
            top_skus_list.append(sku_entry)
        else:
            other_tx_count += s["tx_count"]
            other_issued_qty += s["issued_qty"]
            other_issued_val += s["issued_val"]
            other_grn_qty += s["grn_qty"]
            other_grn_val += s["grn_val"]
            other_returns_qty += s["returns_qty"]
            other_returns_count += s["returns_count"]

    if other_tx_count > 0:
        top_skus_list.append({
            "sku": "OTHER_SKUS",
            "name": "Other Low-Value SKUs Grouped",
            "category": "VARIOUS",
            "group": "VARIOUS",
            "price": 0.0,
            "issued_qty": other_issued_qty,
            "grn_qty": other_grn_qty,
            "issued_val": round(other_issued_val, 2),
            "grn_val": round(other_grn_val, 2),
            "tx_count": other_tx_count,
            "returns_qty": other_returns_qty,
            "returns_count": other_returns_count,
            "return_rate_pct": round((other_returns_qty / other_issued_qty) * 100, 2) if other_issued_qty > 0 else 0,
            "reusable": 0,
            "returnable": 0,
            "abc_class": "C"
        })

    with open(os.path.join(output_dir, "skus.json"), "w", encoding="utf-8") as out:
        json.dump(top_skus_list, out, indent=2)

    # Save Operations
    reasons_list = []
    for r, count in order_reasons.items():
        reasons_list.append({
            "reason": r,
            "count": count,
            "qty": order_reason_qty[r],
            "value": round(order_reason_val[r], 2)
        })
    reasons_list = sorted(reasons_list, key=lambda x: x["value"], reverse=True)

    operations_data = {
        "order_reasons": reasons_list,
        "anomalies": anomalies[:30],
        "stockout_risks": stockout_risks
    }
    with open(os.path.join(output_dir, "operations.json"), "w", encoding="utf-8") as out:
        json.dump(operations_data, out, indent=2)

    print("Pre-aggregation complete! JSON datasets saved successfully.")

if __name__ == "__main__":
    analyze()

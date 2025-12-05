import requests
import os

# URL from the ECB Data Portal API examples
# EXR = Exchange Rates
# M = Monthly
# USD = US Dollar
# EUR = Euro
# SP00 = Spot
# A = Average
# format=csvdata gives us a CSV response
URL = "https://data-api.ecb.europa.eu/service/data/EXR/M.USD.EUR.SP00.A?format=csvdata"

OUTPUT_FILE = os.path.join("data", "data_out.csv")

def fetch_ecb_rates():
    print(f"Fetching data from {URL}...")
    try:
        response = requests.get(URL)
        response.raise_for_status()
        
        # Ensure the data directory exists
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        
        with open(OUTPUT_FILE, "wb") as f:
            f.write(response.content)
            
        print(f"Successfully saved data to {OUTPUT_FILE}")
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")

if __name__ == "__main__":
    fetch_ecb_rates()

import csv
import os

FILE_IN = os.path.join("data", "data_in.csv")
FILE_OUT = os.path.join("data", "data_out.csv")

def read_csv(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return list(csv.reader(f))

def compare_files():
    if not os.path.exists(FILE_IN):
        print(f"Error: {FILE_IN} does not exist.")
        return
    if not os.path.exists(FILE_OUT):
        print(f"Error: {FILE_OUT} does not exist.")
        return

    data_in = read_csv(FILE_IN)
    data_out = read_csv(FILE_OUT)

    print(f"Rows in {FILE_IN}: {len(data_in)}")
    print(f"Rows in {FILE_OUT}: {len(data_out)}")

    if data_in == data_out:
        print("The files are identical.")
    else:
        print("The files are different.")
        
        # Check header
        if data_in[0] != data_out[0]:
            print("Headers are different.")
        
        # Check content
        set_in = set(tuple(row) for row in data_in)
        set_out = set(tuple(row) for row in data_out)
        
        only_in_in = set_in - set_out
        only_in_out = set_out - set_in
        
        if only_in_in:
            print(f"\nRows only in {FILE_IN} ({len(only_in_in)}):")
            for row in list(only_in_in)[:5]:
                print(row)
            if len(only_in_in) > 5: print("...")

        if only_in_out:
            print(f"\nRows only in {FILE_OUT} ({len(only_in_out)}):")
            for row in list(only_in_out)[:5]:
                print(row)
            if len(only_in_out) > 5: print("...")

if __name__ == "__main__":
    compare_files()

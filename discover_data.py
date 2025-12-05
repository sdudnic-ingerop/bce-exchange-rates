import requests
import xml.etree.ElementTree as ET
import os

# L'endpoint pour lister tous les flux de données (Dataflows)
# On demande du XML car c'est le format standard pour les métadonnées SDMX
URL_DATAFLOWS = "https://data-api.ecb.europa.eu/service/dataflow"

def list_dataflows():
    print(f"Récupération de la liste des domaines statistiques (Dataflows) depuis {URL_DATAFLOWS}...")
    try:
        response = requests.get(URL_DATAFLOWS)
        response.raise_for_status()
        
        # Le format retourné est du SDMX-ML (XML)
        # On va parser sommairement pour afficher les IDs et les Noms
        root = ET.fromstring(response.content)
        
        # Les namespaces sont souvent pénibles en XML, on fait une recherche large ou on gère les namespaces
        # Structure typique: mes:Structure > str:Structures > str:Dataflows > str:Dataflow
        
        namespaces = {
            'str': 'http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure',
            'com': 'http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common',
            'xml': 'http://www.w3.org/XML/1998/namespace'
        }
        
        dataflows = root.findall('.//str:Dataflow', namespaces)
        
        print(f"\nNombre de domaines trouvés : {len(dataflows)}")
        print("-" * 80)
        print(f"{'ID':<15} | {'Nom (EN)':<60}")
        print("-" * 80)
        
        for df in dataflows:
            df_id = df.get('id')
            # Trouver le nom en anglais
            name_elem = df.find(".//com:Name[@xml:lang='en']", namespaces)
            name = name_elem.text if name_elem is not None else "N/A"
            
            print(f"{df_id:<15} | {name[:50]}")
            
    except requests.exceptions.RequestException as e:
        print(f"Erreur lors de la requête : {e}")
    except ET.ParseError as e:
        print(f"Erreur de parsing XML : {e}")

if __name__ == "__main__":
    list_dataflows()

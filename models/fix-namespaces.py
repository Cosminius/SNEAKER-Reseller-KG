from rdflib import Graph

INPUT_FILE = "refine_full.ttl"
OUTPUT_FILE = "clean_refine_full.ttl"

g = Graph()
g.parse(INPUT_FILE, format="turtle")

# Bind prefix for pretty output
g.bind("", "http://sneakerproject.org#")

g.serialize(
    destination=OUTPUT_FILE,
    format="turtle"
)

print("Done →", OUTPUT_FILE)
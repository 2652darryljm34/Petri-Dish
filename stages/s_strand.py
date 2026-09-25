# 9x9 from nothing, proportioned so no tier starves the one below it:
#   rows 0-2 culture (108 bacteria a lap)   row 3 spores (72, costs 72 bacteria)
#   row 4 mycelium harvested, row 5 left standing as its links (45 spores a lap)
#   rows 6-7 one biofilm block              row 8 strand
def row(y):
    while pos_y() != y:
        move(SOUTH)

def sweep(y):
    row(y)
    for x in range(9):
        sterilize()
        move(EAST)

def farm():
    for y in range(3):
        row(y)
        for x in range(9):
            harvest()
            seed(CULTURE)
            move(EAST)
    row(3)
    for x in range(9):
        harvest()
        if substrate() == AGAR:
            sterilize()
        seed(SPORE)
        move(EAST)
    row(4)
    for x in range(9):
        harvest()
        seed(MYCELIUM)
        move(EAST)
    row(5)
    for x in range(9):
        seed(MYCELIUM)
        move(EAST)
    row(6)
    if mature():
        harvest()
    for y in range(2):
        row(6 + y)
        for x in range(9):
            if substrate() == AGAR:
                sterilize()
            seed(BIOFILM)
            move(EAST)

sweep(3)
sweep(6)
sweep(7)
sweep(8)

while True:
    while num(BIOMASS) < 400:
        farm()
    row(8)
    for x in range(9):
        if substrate() == AGAR:
            sterilize()
        seed(STRAND)
        move(EAST)
    t0 = steps()
    while steps() < t0 + 42:
        wait()
    harvest()

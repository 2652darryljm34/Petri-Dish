# 7x7 from nothing:
#   rows 0-1  culture    rows 3-4  mycelium
#   row  2    spores     rows 5-6  biofilm (one 14-cell patch per cycle)
def row(y):
    while pos_y() != y:
        move(SOUTH)

def sweep(y):
    row(y)
    for x in range(7):
        sterilize()
        move(EAST)

sweep(2)
sweep(5)
sweep(6)

while True:
    for y in range(2):
        row(y)
        for x in range(7):
            harvest()
            seed(CULTURE)
            move(EAST)
    row(2)
    for x in range(7):
        harvest()
        if substrate() == AGAR:
            sterilize()
        seed(SPORE)
        move(EAST)
    for y in range(2):
        row(3 + y)
        for x in range(7):
            harvest()
            seed(MYCELIUM)
            move(EAST)
    for y in range(2):
        row(5 + y)
        for x in range(7):
            if mature():
                harvest()
            if substrate() == AGAR:
                sterilize()
            seed(BIOFILM)
            move(EAST)

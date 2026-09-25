# 7x7, nothing staked.
# rows 0-2  culture   (bacteria)
# row  3    spore     (spores)
# rows 4-6  mycelium  (only row 5 is harvested; 4 and 6 are its links)
def go(ty):
    while pos_y() != ty:
        move(SOUTH)

while True:
    for y in range(3):
        go(y)
        for x in range(7):
            harvest()
            seed(CULTURE)
            move(EAST)
    go(3)
    for x in range(7):
        harvest()
        sterilize()
        seed(SPORE)
        move(EAST)
    for y in range(3):
        go(4 + y)
        for x in range(7):
            if y == 1:
                harvest()
            seed(MYCELIUM)
            move(EAST)

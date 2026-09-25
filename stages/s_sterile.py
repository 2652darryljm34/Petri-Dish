# 5x5: rows 0-3 culture, row 4 spores
while True:
    for y in range(4):
        for x in range(5):
            harvest()
            seed(CULTURE)
            move(EAST)
        move(SOUTH)
    for x in range(5):
        harvest()
        if substrate() == AGAR:
            sterilize()
        seed(SPORE)
        move(EAST)
    move(SOUTH)

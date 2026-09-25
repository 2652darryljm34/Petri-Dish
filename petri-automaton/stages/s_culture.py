while True:
    harvest()
    seed(CULTURE)
    move(EAST)
    if pos_x() == 0:
        move(SOUTH)

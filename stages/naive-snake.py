# the strategy the old stage rewarded: plant mycelium everywhere, snake forever
while True:
    harvest()
    seed(MYCELIUM)
    move(EAST)
    if pos_x() == 0:
        move(SOUTH)
